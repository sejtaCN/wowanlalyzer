/**
 * 相邻两行交换 A/B：把优先级表里相邻的两条动作换个前后，看 DPS 到底动多少。
 *
 * 与 decision-ab.mjs 的区别：那个改一条条件的阈值，这个一行字都不改，只交换顺序。
 * 问的问题是「攻略里写的先后顺序，值多少 DPS」。
 *
 * 三条硬约束：
 *   1. content/profiles/*.simc 只读。变体写到 .tools/tmp/，原 profile 一个字节不改。
 *   2. 每次比较都先过配对校验（hero / profileId / 场景 / 目标数 / 时长 / 迭代 / 样本数 /
 *      SimC 版本与 commit 必须一致），不一致就不出差值。
 *   3. 同一文本各跑 REPS 次；两次方向一致且都超出保守误差上限，才算「交换有可测影响」。
 *
 * 用法：
 *   node scripts/adjacent-swap.mjs --dry-run     # 只打印边界与拟交换行，不跑不写
 *   node scripts/adjacent-swap.mjs --run         # 跑模拟 + 写 content/sims + 汇总 analysis
 *
 * 可选：--iters=5000 --reps=2 --scenarios=st,t3,add5,w30_8 --only=s1,s2
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMC_DIR = join(ROOT, '.tools', 'simc');
const SIMC = join(SIMC_DIR, 'simc.exe');
const TMP = join(ROOT, '.tools', 'tmp');
const OUT_DIR = join(ROOT, 'content', 'sims');
const ANALYSIS_OUT = join(ROOT, 'content', 'analysis', 'adjacent-archon.json');
const PROFILE = join(ROOT, 'content', 'profiles', 'MID2_shadow_archon.simc');
const PROFILE_SOURCE = relative(ROOT, PROFILE).split(sep).join('/');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
};
const REUSE = argv.includes('--reuse');
const RUN = argv.includes('--run') || REUSE;
const ITERS = Number(argOf('iters', 5000));
const REPS = Number(argOf('reps', 2));
const THREADS = Number(argOf('threads', 8));
const ONLY = argOf('only', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;

const ALL_SCENARIOS = [
  { id: 'st', label: '单体 300s', fightStyle: 'Patchwerk', targets: 1, maxTime: 300 },
  { id: 't3', label: '3 目标 300s', fightStyle: 'Patchwerk', targets: 3, maxTime: 300 },
  { id: 'add5', label: '5 小怪 30s', fightStyle: 'Patchwerk', targets: 5, maxTime: 30 },
  { id: 'w30_8', label: '8 目标 30s', fightStyle: 'Patchwerk', targets: 8, maxTime: 30 },
];
const SCENARIOS = ALL_SCENARIOS.filter((s) => !argOf('scenarios', null) || argOf('scenarios', '').split(',').includes(s.id));

/**
 * 拟交换的相邻对，用「优先级表里的行号」定位（actions.main 的第 N 条可执行动作）。
 * expected 是两侧技能名，profile 换版本对不上就报错停下，避免静默换错行。
 * guideClaim 记录攻略源就此下的断言，供事后逐条对照（supports / contradicts / insufficient / not_claimed）。
 */
const SWAPS = [
  {
    id: 's1',
    label: '同条件的两个挂 DoT 动作：触手猛击 ↔ 吸血鬼之触',
    rows: [2, 3],
    expected: ['tentacle_slam', 'vampiric_touch'],
    why: '两行条件逐字相同（都要求吸血鬼之触没在跳、目标存活 ≥ 10、已挂 < 5），只差谁先占这个 GCD。',
    guideClaim: {
      chapter: 'l0-01-what-shadow-does',
      quote: '吸血鬼之触：第一个 GCD 就给它，别等怪聚齐',
      raw: 'actions.main 顺序里 vampiric_touch 排在填充技能之前',
      expectation: 'none',
      note: '指南没直接说「触手猛击与吸血鬼之触」谁先，只说了 DoT 要排在填充前；本条只提供这两行互换的实测值。',
    },
  },
  {
    id: 's2',
    label: '虚空齐射（前段那行）↔ 虚空冲击',
    rows: [8, 9],
    expected: ['void_volley', 'void_blast'],
    why: '齐射是多目标覆盖面最大的动作，冲击是单体填充；交换检验「齐射靠前」这条到底值多少。',
    guideClaim: {
      chapter: 'l1-02-large',
      quote: '虚空齐射：多目标时它覆盖的目标最多，冷却好了就用',
      raw: 'actions.main+=/void_volley 排在前段；模拟 w30_8 增益稳定',
      expectation: 'swap_hurts',
      note: '指南说齐射该靠前；若交换后多目标场景 DPS 下降，说明这个位置确实值钱。',
    },
  },
  {
    id: 's3',
    label: '虚空齐射（存层那行）↔ 心灵鞭笞',
    rows: [17, 18],
    expected: ['void_volley', 'mind_flay'],
    why: '存层那行是有条件的齐射，鞭笞是无条件填充；交换等于「先补鞭笞再放齐射」。',
    guideClaim: {
      chapter: 'l0-01-what-shadow-does',
      quote: '精神鞭笞：它是填充。持续伤害没铺满时，不要拿它换刷新',
      raw: 'actions.main 里 mind_flay 排在所有 DoT 之后',
      expectation: 'swap_hurts',
      note: '指南说填充该垫底；把鞭笞提到条件性齐射之前，应该掉 DPS。',
    },
  },
  {
    id: 's4',
    label: '触手猛击（留充能那行）↔ 暗言术：灭（残血那行）',
    rows: [19, 20],
    expected: ['tentacle_slam', 'shadow_word_death'],
    why: '低位两行：一行是「加怪前留充能」，一行是「只打残血」；交换检验灭到底会不会抢走 GCD。',
    guideClaim: {
      chapter: 'l1-06-adds',
      quote: '暗言术：灭：加怪窗口里目标满血，轮不上。把 GCD 让给持续伤害',
      raw: '灭的两个条件都要目标残血或有吸收盾',
      expectation: 'swap_no_effect',
      note: '指南说灭基本轮不上；若交换落在误差内，正好支持这句话。',
    },
  },
];

/** 阳性对照：把无条件的 mind_flay 提到主循环第一位。预期 DPS 明显下降。 */
const CONTROL_POSITIVE = {
  id: 'ctl_pos',
  label: '阳性对照：心灵鞭笞提到主循环第一位',
  fromRow: 18,
  expectedSkill: 'mind_flay',
  why: '无条件动作置顶会把所有 GCD 吃掉；若 DPS 不降，说明这套 A/B 根本没生效。',
  guideClaim: {
    chapter: 'l0-01-what-shadow-does',
    quote: '精神鞭笞：它是填充。持续伤害没铺满时，不要拿它换刷新',
    raw: 'actions.main 里 mind_flay 排在所有 DoT 之后',
    expectation: 'swap_hurts',
    note: '把填充置顶是这句话的反向验证：掉得越狠，指南这句越站得住。',
  },
};

const HERO = 'archon';
const PROFILE_ID = 'archon';

// ---------------------------------------------------------------- APL 解析

/** 与 apl-to-guide.mjs 同一套抽取规则：跳过 variable / call_action_list / run_action_list。 */
const ACTION_RE = /^(actions(?:\.[a-z_]+)?)\+?=\/([a-z_0-9]+)(?:,(.*))?$/;
const SKIP_SKILLS = new Set(['variable', 'call_action_list', 'run_action_list']);

export function parseRows(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  const orderBySection = {};
  lines.forEach((line, i) => {
    const m = ACTION_RE.exec(line.trim());
    if (!m) return;
    const [, section, skill, rest] = m;
    if (SKIP_SKILLS.has(skill) || !section) return;
    orderBySection[section] = (orderBySection[section] ?? 0) + 1;
    rows.push({ lineIndex: i, section, order: orderBySection[section], skill, rest: rest ?? '', line: line.trim() });
  });
  return rows;
}

const mainRows = (rows) => rows.filter((r) => r.section === 'actions.main');

/** 两行之间是否还夹着别的可执行动作行（只允许注释与空行）。 */
export function areAdjacent(text, a, b) {
  const lines = text.split(/\r?\n/);
  const [lo, hi] = a.lineIndex < b.lineIndex ? [a.lineIndex, b.lineIndex] : [b.lineIndex, a.lineIndex];
  for (let i = lo + 1; i < hi; i += 1) {
    const t = lines[i].trim();
    if (!t || t.startsWith('#')) continue;
    if (ACTION_RE.test(t)) return false;
  }
  return true;
}

/** 交换两行的位置（只换这两行，其它行原地不动）。 */
export function swapLines(text, a, b) {
  const lines = text.split(/\r?\n/);
  const tmp = lines[a.lineIndex];
  lines[a.lineIndex] = lines[b.lineIndex];
  lines[b.lineIndex] = tmp;
  return lines.join('\n');
}

/** 把某一行搬到另一行之前（阳性对照用）。 */
export function moveLineBefore(text, from, to) {
  const lines = text.split(/\r?\n/);
  const [moved] = lines.splice(from.lineIndex, 1);
  const insertAt = to.lineIndex > from.lineIndex ? to.lineIndex - 1 : to.lineIndex;
  lines.splice(insertAt, 0, moved);
  return lines.join('\n');
}

// ---------------------------------------------------------------- 统计口径

/** 差值保守误差上限；任一 CI 缺失、为 0 或非有限值就返回 null。 */
export function conservativeDeltaCiPct(on, off) {
  if (!Number.isFinite(on?.mean) || !Number.isFinite(off?.mean) || off.mean <= 0) return null;
  if (!Number.isFinite(on?.ci95Pct) || !Number.isFinite(off?.ci95Pct) || on.ci95Pct <= 0 || off.ci95Pct <= 0) return null;
  const ciOnAbs = (on.mean * on.ci95Pct) / 100;
  const ciOffAbs = (off.mean * off.ci95Pct) / 100;
  return ((ciOnAbs + ciOffAbs) / off.mean) * 100;
}

export function deltaPctOf(before, after) {
  if (!Number.isFinite(before?.mean) || !Number.isFinite(after?.mean) || before.mean <= 0) return null;
  return ((after.mean - before.mean) / before.mean) * 100;
}

/**
 * 配对校验：只比「同一次实验里必须相同」的字段。返回不一致项，空数组=通过。
 * samples 不要求逐位相等（SimC 每次实际样本数会浮动几个），改为 1% 以内的容差校验。
 */
export const PAIR_FIELDS = [
  'hero',
  'profileId',
  'scenarioId',
  'targets',
  'durationSec',
  'iterations',
  'fightStyle',
  'simcVersion',
  'simcRevision',
];

export const SAMPLE_TOLERANCE = 0.01;

export function pairIssues(before, after) {
  const issues = [];
  for (const field of PAIR_FIELDS) {
    if (before?.[field] !== after?.[field]) {
      issues.push(`${field}: ${before?.[field]} ≠ ${after?.[field]}`);
    }
  }
  if (!Number.isFinite(before?.dps?.mean) || !Number.isFinite(after?.dps?.mean)) issues.push('dps.mean 缺失');
  const sa = before?.dps?.samples;
  const sb = after?.dps?.samples;
  if (!Number.isFinite(sa) || !Number.isFinite(sb) || sa <= 0 || sb <= 0) {
    issues.push('dps.samples 缺失');
  } else if (Math.abs(sa - sb) / Math.max(sa, sb) > SAMPLE_TOLERANCE) {
    issues.push(`dps.samples 相差超过 ${SAMPLE_TOLERANCE * 100}%: ${sa} vs ${sb}`);
  }
  return issues;
}

/**
 * 单次配对的结论。
 *   undetermined：CI 缺失 / 为 0 / 非有限，或配对不成立 → 不出差值
 *   effective   ：|差值| > 保守误差上限
 *   within_noise：差值落在误差内
 */
export function pairVerdict(before, after) {
  const issues = pairIssues(before, after);
  if (issues.length) return { verdict: 'undetermined', deltaPct: null, ciPct: null, issues };
  const deltaPct = deltaPctOf(before.dps, after.dps);
  const ciPct = conservativeDeltaCiPct(after.dps, before.dps);
  if (deltaPct == null || ciPct == null) {
    // CI 缺失 / 为 0 / 非有限：差值也不许出现在结果里，避免被当成结论引用
    return { verdict: 'undetermined', deltaPct: null, ciPct: null, issues: ['CI 不完整'] };
  }
  return { verdict: Math.abs(deltaPct) > ciPct ? 'effective' : 'within_noise', deltaPct, ciPct, issues: [] };
}

/** 多次重复的方向一致性：全部有效且同号才算稳定结论。 */
export function aggregateReps(pairs) {
  if (pairs.some((p) => p.verdict === 'undetermined') || pairs.length === 0) return 'undetermined';
  const valid = pairs.filter((p) => p.verdict === 'effective');
  if (valid.length === pairs.length && pairs.every((p) => Math.sign(p.deltaPct) === Math.sign(pairs[0].deltaPct))) {
    return 'effective';
  }
  return 'within_noise';
}

/**
 * 跨场景结论：至少两个场景判有效且同号，才升格为「整组有效」。
 * 只有一个场景有效 → scenario_specific（只在该场景成立，不外推）。
 */
export function groupVerdict(perScenario) {
  const rows = Object.values(perScenario);
  if (rows.length === 0 || rows.some((r) => r.verdict === 'undetermined')) return 'undetermined';
  const effective = rows.filter((r) => r.verdict === 'effective');
  if (effective.length === 0) return 'within_noise';
  const signs = new Set(effective.map((r) => Math.sign(r.deltaPct)));
  if (signs.size > 1) return 'inconsistent';
  return effective.length >= 2 ? 'effective' : 'scenario_specific';
}

/** 攻略断言 ↔ 实测结果。expectation 决定「支持」长什么样。 */
export function guideMatch(expectation, verdict, deltaPct) {
  if (expectation === 'none') return 'not_claimed';
  if (verdict === 'undetermined') return 'undetermined';
  // 结构等价：这一组没测到顺序，不能算支持，也不能算「证据不足」——是根本没测。
  if (verdict === 'structurally_inert') return 'untested';
  if (expectation === 'swap_no_effect') {
    return verdict === 'within_noise' ? 'supports' : 'contradicts';
  }
  // swap_hurts：指南认为现有顺序更优
  if (verdict === 'within_noise') return 'insufficient';
  if (verdict === 'inconsistent') return 'inconsistent';
  return deltaPct < 0 ? 'supports' : 'contradicts';
}

// ---------------------------------------------------------------- SimC

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

function runSimc(profilePath, scenario, iters) {
  const jsonPath = join(TMP, `adj_${scenario.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const args = [
    profilePath,
    `iterations=${iters}`,
    `threads=${THREADS}`,
    `fight_style=${scenario.fightStyle}`,
    `max_time=${scenario.maxTime}`,
    `desired_targets=${scenario.targets}`,
    `json2=${jsonPath.replace(/\\/g, '/')}`,
  ];
  return new Promise((res, rej) => {
    const p = spawn(SIMC, args, { cwd: SIMC_DIR });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', rej);
    p.on('close', (code) => {
      if (code !== 0 || !existsSync(jsonPath)) return rej(new Error(`simc ${code}: ${out.slice(-400)}`));
      const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
      rmSync(jsonPath, { force: true });
      res(j);
    });
  });
}

const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));

// ---------------------------------------------------------------- 计划

function buildPlan(baseText) {
  const rows = mainRows(parseRows(baseText));
  const problems = [];
  const pick = (order) => {
    const row = rows.find((r) => r.order === order);
    if (!row) problems.push(`actions.main 里找不到第 ${order} 条动作`);
    return row;
  };

  const swaps = SWAPS.filter((s) => !ONLY || ONLY.includes(s.id)).map((s) => {
    const a = pick(s.rows[0]);
    const b = pick(s.rows[1]);
    if (!a || !b) return { ...s, error: '行号对不上' };
    if (a.skill !== s.expected[0] || b.skill !== s.expected[1]) {
      problems.push(`${s.id}：第 ${s.rows[0]}/${s.rows[1]} 行是 ${a?.skill}/${b?.skill}，与登记的 ${s.expected.join('/')} 不符`);
    }
    if (s.rows[1] - s.rows[0] !== 1) problems.push(`${s.id}：表内行号 ${s.rows.join('/')} 不相邻`);
    if (!areAdjacent(baseText, a, b)) problems.push(`${s.id}：APL 里这两行之间还夹着别的可执行动作行，不能叫「相邻交换」`);
    return {
      ...s,
      apl: {
        mode: 'swap-two-adjacent-lines',
        before: [
          { lineNo: a.lineIndex + 1, text: a.line },
          { lineNo: b.lineIndex + 1, text: b.line },
        ],
        after: [
          { lineNo: a.lineIndex + 1, text: b.line },
          { lineNo: b.lineIndex + 1, text: a.line },
        ],
      },
      text: swapLines(baseText, a, b),
    };
  });

  const posRow = pick(CONTROL_POSITIVE.fromRow);
  const firstName = rows.find((r) => r.order === 1);
  let positive = null;
  if (posRow && firstName) {
    if (posRow.skill !== CONTROL_POSITIVE.expectedSkill) {
      problems.push(`阳性对照：第 ${CONTROL_POSITIVE.fromRow} 行是 ${posRow.skill}，与登记的 ${CONTROL_POSITIVE.expectedSkill} 不符`);
    }
    positive = {
      id: CONTROL_POSITIVE.id,
      label: CONTROL_POSITIVE.label,
      why: CONTROL_POSITIVE.why,
      guideClaim: CONTROL_POSITIVE.guideClaim,
      apl: {
        mode: 'move-line-to-top',
        before: [{ lineNo: posRow.lineIndex + 1, text: posRow.line }],
        after: [{ lineNo: firstName.lineIndex + 1, text: posRow.line }],
        removedFrom: { lineNo: posRow.lineIndex + 1, text: posRow.line },
      },
      text: moveLineBefore(baseText, posRow, firstName),
    };
  }

  return { rows, swaps, positive, problems };
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const baseText = readFileSync(PROFILE, 'utf8');
  const plan = buildPlan(baseText);
  const sha = sha256(baseText);

  if (plan.problems.length) {
    console.error('计划校验失败，未跑任何模拟：');
    for (const p of plan.problems) console.error(`  ✗ ${p}`);
    process.exit(2);
  }

  console.log(`profile  ${PROFILE_SOURCE}  sha256:${sha}（只读）`);
  console.log(`迭代 ${ITERS} · 线程 ${THREADS} · 重复 ${REPS} 次 · 场景 ${SCENARIOS.map((s) => s.id).join('/')}`);
  console.log(`交换组 ${plan.swaps.length} + 阳性对照 1`);

  if (!RUN) {
    console.log('\n=== 拟交换的相邻行（dry-run，不写 content/profiles，不写 content/sims）===');
    for (const s of plan.swaps) {
      console.log(`\n[${s.id}] ${s.label} · 表内第 ${s.rows.join('↔')} 条 · ${s.apl.mode}`);
      for (const l of s.apl.before) console.log(`  原 L${l.lineNo}: ${l.text}`);
      for (const l of s.apl.after) console.log(`  改 L${l.lineNo}: ${l.text}`);
      console.log(`  攻略源：${s.guideClaim.chapter}「${s.guideClaim.quote}」/ 预期 ${s.guideClaim.expectation}`);
    }
    console.log(`\n[${plan.positive.id}] ${plan.positive.label} · ${plan.positive.apl.mode}`);
    for (const l of plan.positive.apl.before) console.log(`  原 L${l.lineNo}: ${l.text}`);
    for (const l of plan.positive.apl.after) console.log(`  改 L${l.lineNo}: ${l.text}`);
    console.log(`  攻略源：${plan.positive.guideClaim.chapter}「${plan.positive.guideClaim.quote}」/ 预期 ${plan.positive.guideClaim.expectation}`);
    const runs = (plan.swaps.length + 2) * SCENARIOS.length * REPS;
    console.log(`\n预计 run 数 ${runs}；新文件 content/sims/adj_*.json ${runs} 个，另写 content/analysis/adjacent-archon.json`);
    console.log('换行数：每个变体只改 2 行（阳性对照 1 行移位），其余行逐字不变。');
    return;
  }

  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const variants = [
    { id: 'base', label: '未改动 profile（同文本重跑作对照）', apl: null, text: baseText },
    { id: plan.positive.id, label: plan.positive.label, apl: plan.positive.apl, text: plan.positive.text },
    ...plan.swaps.map((s) => ({ id: s.id, label: s.label, apl: s.apl, text: s.text })),
  ];

  const wanted = new Set();
  for (const v of variants) {
    for (const s of SCENARIOS) {
      for (let rep = 1; rep <= REPS; rep += 1) wanted.add(`adj_${v.id}__${s.id}__${ITERS}_r${rep}`);
    }
  }

  const records = [];
  if (REUSE) {
    for (const f of readdirSync(OUT_DIR)) {
      if (!f.startsWith('adj_') || !f.endsWith('.json')) continue;
      const rec = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
      if (rec?.runId && wanted.has(rec.runId)) records.push(rec);
    }
    const missing = [...wanted].filter((id) => !records.some((r) => r.runId === id));
    if (missing.length) {
      console.error(`--reuse 缺少 ${missing.length} 条记录：${missing.slice(0, 5).join(', ')}`);
      process.exit(2);
    }
    records.sort((a, b) => a.runId.localeCompare(b.runId));
    console.log(`\n复用 ${records.length} 条既有 sim 记录，不重跑模拟`);
  }

  const traceSkills = [...new Set([...plan.swaps.flatMap((s) => s.expected), plan.positive.expectedSkill])];

  if (!REUSE) for (const v of variants) {
    const variantFile = join(TMP, `adj_${v.id}_${sha}.simc`);
    if (v.id !== 'base') writeFileSync(variantFile, v.text);
    const path = v.id === 'base' ? PROFILE : variantFile;
    const variantSha = sha256(v.text);
    for (const scenario of SCENARIOS) {
      for (let rep = 1; rep <= REPS; rep += 1) {
        const runId = `adj_${v.id}__${scenario.id}__${ITERS}_r${rep}`;
        process.stdout.write(`${runId.padEnd(30)} ... `);
        const j = await runSimc(path, scenario, ITERS);
        const s = j.sim?.statistics?.raid_dps;
        if (!s?.mean) {
          console.log('无结果');
          continue;
        }
        const n = s.count ?? ITERS;
        const ci = s.std_dev ? (1.96 * s.std_dev) / Math.sqrt(n) : null;
        const rec = {
          runId,
          layer: 'A',
          kind: 'adjacent-swap',
          hero: HERO,
          profileId: PROFILE_ID,
          profileFile: PROFILE_SOURCE,
          profileSha256: variantSha,
          baseProfileSha256: sha,
          variantId: v.id,
          variantLabel: v.label,
          swapGroup: v.id === 'base' ? null : v.id,
          scenarioId: scenario.id,
          scenarioLabel: scenario.label,
          fightStyle: scenario.fightStyle,
          targets: scenario.targets,
          durationSec: scenario.maxTime,
          rep,
          iterations: j.sim?.options?.iterations ?? ITERS,
          dps: {
            mean: Math.round(s.mean * 100) / 100,
            ci95: ci ? Math.round(ci * 100) / 100 : null,
            ci95Pct: ci ? Math.round((ci / s.mean) * 10000) / 100 : null,
            samples: n,
          },
          simc: {
            version: j.version ?? null,
            gitBranch: j.git_branch ?? null,
            gitRevision: j.git_revision ?? null,
            buildDate: j.build_date ?? null,
          },
          edit: v.apl ? { mode: v.apl.mode, lines: v.apl.before, after: v.apl.after } : { mode: 'none', lines: [] },
          /**
           * 交换涉及技能的施放痕迹：用来区分「差值 0 是因为顺序无所谓」和
           * 「差值 0 是因为这一行根本没被执行」。伤害表里查不到即视为 0 次。
           */
          spellTrace: Object.fromEntries(
            traceSkills.map((skill) => {
              const hit = Object.values(j.sim?.players?.[0]?.stats ?? {}).find((x) => x?.name === skill);
              return [
                skill,
                {
                  present: Boolean(hit),
                  executions: hit?.num_executes?.sum ?? 0,
                  damageMean: hit?.actual_amount?.mean != null ? Math.round(hit.actual_amount.mean) : 0,
                },
              ];
            }),
          ),
          generatedAt: new Date().toISOString(),
        };
        writeFileSync(join(OUT_DIR, `${runId}.json`), JSON.stringify(rec, null, 2) + '\n');
        records.push(rec);
        console.log(`DPS ${fmt(rec.dps.mean)} ±${rec.dps.ci95Pct}%`);
      }
    }
  }

  // ---- 配对与结论 ----
  const meta = (r) => ({
    hero: r.hero,
    profileId: r.profileId,
    scenarioId: r.scenarioId,
    targets: r.targets,
    durationSec: r.durationSec,
    iterations: r.iterations,
    fightStyle: r.fightStyle,
    simcVersion: r.simc.version,
    simcRevision: r.simc.gitRevision,
    dps: r.dps,
  });
  const findRep = (variantId, scenarioId, rep) =>
    records.find((r) => r.variantId === variantId && r.scenarioId === scenarioId && r.rep === rep);

  const compare = (variantId, scenarioId) => {
    const pairs = [];
    for (let rep = 1; rep <= REPS; rep += 1) {
      const before = findRep('base', scenarioId, rep);
      const after = findRep(variantId, scenarioId, rep);
      if (!before || !after) continue;
      const v = pairVerdict(meta(before), meta(after));
      pairs.push({
        rep,
        beforeRunId: before.runId,
        afterRunId: after.runId,
        beforeDps: before.dps.mean,
        afterDps: after.dps.mean,
        beforeCi95Pct: before.dps.ci95Pct,
        afterCi95Pct: after.dps.ci95Pct,
        deltaPct: v.deltaPct == null ? null : Math.round(v.deltaPct * 100) / 100,
        ciPct: v.ciPct == null ? null : Math.round(v.ciPct * 100) / 100,
        verdict: v.verdict,
        issues: v.issues,
      });
    }
    const verdict = aggregateReps(pairs);
    const deltas = pairs.map((p) => p.deltaPct).filter((d) => d != null);
    return {
      verdict,
      deltaPct: deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100 : null,
      ciPct: pairs[0]?.ciPct ?? null,
      pairs,
    };
  };

  const scenariosOut = {};
  const controlRerun = { perScenario: {} };
  const controlPositive = { perScenario: {} };
  for (const scenario of SCENARIOS) {
    scenariosOut[scenario.id] = scenario;
    // 同文本重跑对照：base r1 vs base r2，差值必须落在误差内
    const r1 = findRep('base', scenario.id, 1);
    const r2 = findRep('base', scenario.id, 2);
    if (r1 && r2) {
      const v = pairVerdict(meta(r1), meta(r2));
      controlRerun.perScenario[scenario.id] = {
        runIds: [r1.runId, r2.runId],
        deltaPct: v.deltaPct == null ? null : Math.round(v.deltaPct * 100) / 100,
        ciPct: v.ciPct == null ? null : Math.round(v.ciPct * 100) / 100,
        verdict: v.verdict,
        note: '同一份 profile 重跑两次；若判成 effective，说明这套阈值太松。',
      };
    }
    controlPositive.perScenario[scenario.id] = compare(plan.positive.id, scenario.id);
  }
  controlPositive.verdict = groupVerdict(controlPositive.perScenario);
  controlPositive.deltaPct = controlPositive.perScenario[SCENARIOS[0].id]?.deltaPct ?? null;
  controlPositive.guideClaim = plan.positive.guideClaim;
  controlPositive.guideMatch = guideMatch(
    plan.positive.guideClaim.expectation,
    controlPositive.verdict,
    controlPositive.perScenario[SCENARIOS[0].id]?.deltaPct ?? null,
  );

  const groups = plan.swaps.map((s) => {
    const perScenario = {};
    for (const scenario of SCENARIOS) perScenario[scenario.id] = compare(s.id, scenario.id);
    const deltas = Object.values(perScenario).map((r) => r.deltaPct).filter((d) => d != null);
    const baseExec = {};
    const afterExec = {};
    for (const skill of s.expected) {
      baseExec[skill] = {};
      afterExec[skill] = {};
      for (const scenario of SCENARIOS) {
        baseExec[skill][scenario.id] = findRep('base', scenario.id, 1)?.spellTrace?.[skill]?.executions ?? null;
        afterExec[skill][scenario.id] = findRep(s.id, scenario.id, 1)?.spellTrace?.[skill]?.executions ?? null;
      }
    }
    // 被交换的行在基础跑分里 0 次施放：换不换顺序都一样，这一组测的不是顺序。
    // 这种情况单列一档，不许落进「误差内」——那是「测了但没差」，这是「没测到」。
    const inert = s.expected.filter((skill) => Object.values(baseExec[skill]).every((v) => v === 0));
    const verdict = inert.length ? 'structurally_inert' : groupVerdict(perScenario);
    return {
      id: s.id,
      label: s.label,
      why: s.why,
      tableOrder: s.rows,
      apl: s.apl,
      verdict,
      deltaPct: deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100 : null,
      guideClaim: s.guideClaim,
      guideMatch: guideMatch(s.guideClaim.expectation, verdict, deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null),
      trace: { baseExecutions: baseExec, afterExecutions: afterExec, inertInAllScenarios: inert },
      structuralNote: inert.length
        ? `交换的 ${inert.join(' / ')} 在 ${SCENARIOS.length} 个场景的基础跑分里 0 次施放。这一组是无效对照：差值来自结构等价，不能读成「顺序不影响」，也不计入「误差内」的结论。`
        : null,
      perScenario,
    };
  });

  const firstRun = records[0];
  const analysis = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    hero: HERO,
    profileId: PROFILE_ID,
    profileFile: PROFILE_SOURCE,
    profileSha256: sha,
    priorityTable: 'content/guides/priority-table.json',
    simc: firstRun?.simc ?? null,
    method: {
      design: '单对相邻行交换，其余行逐字不变；before 一律是未改动 profile 的同场景同 rep 跑分。',
      pairing: 'hero / profileId / 场景 / 目标数 / 时长 / 迭代 / 样本数 / SimC 版本与 commit 必须逐项相同，否则不出差值。',
      errorBound: 'ciOnAbs = on.dps * on.ci95Pct / 100；ciOffAbs = off.dps * off.ci95Pct / 100；deltaCiPct = (ciOnAbs + ciOffAbs) / off.dps * 100。',
      decisionRule: '|差值| > 保守误差上限 且 REPS 次方向一致 → 该场景有可测影响；至少两个场景同号才升格为整组有效，单场景有效记为 scenario_specific。',
      iterations: ITERS,
      threads: THREADS,
      reps: REPS,
      scenarios: SCENARIOS.map((s) => ({ id: s.id, label: s.label, targets: s.targets, durationSec: s.maxTime, fightStyle: s.fightStyle })),
    },
    controls: { rerun: controlRerun, positive: controlPositive },
    groups,
    runs: records.map((r) => r.runId).sort(),
  };
  writeFileSync(ANALYSIS_OUT, JSON.stringify(analysis, null, 2) + '\n');

  // ---- 打印结论 ----
  console.log('\n=== 对照 ===');
  for (const [id, row] of Object.entries(controlRerun.perScenario)) {
    console.log(`  重跑 ${id}: ${row.deltaPct}% ±${row.ciPct}% → ${row.verdict}`);
  }
  for (const [id, row] of Object.entries(controlPositive.perScenario)) {
    console.log(`  阳性 ${id}: ${row.deltaPct}% ±${row.ciPct}% → ${row.verdict}`);
  }
  console.log('\n=== 交换组 ===');
  for (const g of groups) {
    console.log(`\n[${g.id}] ${g.label}  → ${g.verdict} / 攻略源对照：${g.guideMatch}`);
    for (const scenario of SCENARIOS) {
      const r = g.perScenario[scenario.id];
      console.log(`  ${scenario.id.padEnd(5)} ${String(r.deltaPct ?? '—').padStart(7)}% ±${r.ciPct ?? '—'}% → ${r.verdict}`);
    }
    if (g.structuralNote) console.log(`  结构提示：${g.structuralNote}`);
  }
  console.log(`\n写出 ${records.length} 个 runId + content/analysis/adjacent-archon.json`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
