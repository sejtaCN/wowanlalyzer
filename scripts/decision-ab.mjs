/**
 * 决策 A/B：改 profile 里的一行 APL 条件，重跑模拟，得到"这个判断值多少"。
 *
 * 与 sims-run.mjs 的区别：那个问"哪个配置好"，这个问"同一个判断换个阈值会怎样"。
 * 每条 runId 都记录：改了哪一行（原文/改后）、原值、新值，方便任何人复核。
 *
 * 用法：node scripts/decision-ab.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMC_DIR = join(ROOT, '.tools', 'simc');
const SIMC = join(SIMC_DIR, 'simc.exe');
const OUT_DIR = join(ROOT, 'content', 'sims');
const TMP = join(ROOT, '.tools', 'tmp');
const ITERS = 5000;

/**
 * 待测决策：VT（吸血鬼之触）在"目标剩余存活 ≥ N 秒"时才上。
 * APL 里写成 `target.time_to_die>=10`，出现在给目标挂 VT 的两行（tentacle_slam / vampiric_touch）。
 */
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const PROFILE = argOf('profile', 'content/profiles/MID2_shadow_archon.simc');
const HERO = argOf('hero', 'archon');

const DECISION = {
  id: 'vt_min_ttd',
  label: 'VT 上 dot 的存活阈值（秒）',
  why: '这波小怪还剩几秒才值得挂 DoT：门槛太高会漏挂，太低会把 GCD 花在即将死掉的目标上。',
  baseValue: 10,
  values: (argOf('values', '6,8,10,12,15,20') || '').split(',').map(Number).filter((n) => Number.isFinite(n)),
  /** 只改"给目标挂 VT"的那两行，不动其它引用 */
  lineFilter: (line) =>
    /^actions\.main\+=?\/(tentacle_slam|vampiric_touch),target_if=min:dot\.vampiric_touch\.remains,if=!dot\.vampiric_touch\.ticking/.test(
      line.trim(),
    ),
  pattern: /time_to_die>=\d+/,
};

/** 阳性对照：把同一个阈值设成 999 秒（正常战斗里几乎永不满足）→ 若 DPS 不塌，说明改动没生效 */
const CONTROL = { ...DECISION, id: 'vt_min_ttd_control', label: 'VT 阈值阳性对照（999s = 几乎不挂）', values: [999], baseValue: 10 };

/** 第二条决策：什么时候切到 AoE 循环（APL 的 active_enemies>2） */
const AOE = {
  id: 'aoe_switch',
  label: 'AoE 循环切换阈值（目标数 > N 时切 AoE）',
  why: '多目标打单体循环会浪费；但目标数不够时切 AoE 会摊薄伤害。这条阈值决定"什么时候换打法"。',
  baseValue: 2,
  values: (argOf('values', '1,2,3,4,6') || '').split(',').map(Number).filter((n) => Number.isFinite(n)),
  lineFilter: (line) => /^actions\+=\/call_action_list,name=aoe,if=active_enemies>\d+/.test(line.trim()),
  pattern: /active_enemies>\d+/,
  replaceWith: (v) => `active_enemies>${v}`,
};

/** 第三条决策：这一波开不开爆发（Voidform）。off 变体把条件改成 if=0，等于整场不用。 */
const BURST = {
  id: 'voidform_on',
  label: '这一波开不开爆发（Voidform）',
  why: '爆发窗口的价值集中在窗口内；但如果这一波目标太少/活得太短，开了等于浪费一轮冷却。',
  baseValue: 1,
  values: (argOf('values', '1,0') || '').split(',').map(Number).filter((n) => Number.isFinite(n)),
  lineFilter: (line) => /^actions\.cds\+=\/voidform,/.test(line.trim()),
  pattern: /,if=.*$/,
  // 1 = 原样（APL 默认条件）；0 = 永不施放
  replaceWith: (v) => (v === 1 ? null : ',if=0'),
};

/** 波次模型：一波怪 = 目标数 × 存活时长。这是"副本节奏"的最小可模拟单元。 */
const WAVES = [
  { id: 'w20_5', label: '5 目标 20s', fightStyle: 'Patchwerk', targets: 5, maxTime: 20 },
  { id: 'w30_5', label: '5 目标 30s', fightStyle: 'Patchwerk', targets: 5, maxTime: 30 },
  { id: 'w45_3', label: '3 目标 45s', fightStyle: 'Patchwerk', targets: 3, maxTime: 45 },
  { id: 'w45_1', label: '单体 45s', fightStyle: 'Patchwerk', targets: 1, maxTime: 45 },
  { id: 'w90_1', label: '单体 90s', fightStyle: 'Patchwerk', targets: 1, maxTime: 90 },
  // 路线波次用：目标数取自 Altar of Fangs 的 15 波，超过 8 只按 8 计（模拟上限）
  { id: 'w90_1b', label: 'BOSS 单体 90s', fightStyle: 'Patchwerk', targets: 1, maxTime: 90 },
  { id: 'w30_2', label: '2 目标 30s', fightStyle: 'Patchwerk', targets: 2, maxTime: 30 },
  { id: 'w30_6', label: '6 目标 30s', fightStyle: 'Patchwerk', targets: 6, maxTime: 30 },
  { id: 'w30_7', label: '7 目标 30s', fightStyle: 'Patchwerk', targets: 7, maxTime: 30 },
  { id: 'w30_8', label: '8 目标 30s', fightStyle: 'Patchwerk', targets: 8, maxTime: 30 },
];

const SCENARIOS = argOf('scenarios', null)
  ? WAVES
  : [
      { id: 'add5', label: '5 小怪 30s', fightStyle: 'Patchwerk', targets: 5, maxTime: 30 },
      { id: 't3', label: '3 目标 300s', fightStyle: 'Patchwerk', targets: 3, maxTime: 300 },
      { id: 'st', label: '单体 300s', fightStyle: 'Patchwerk', targets: 1, maxTime: 300 },
    ];

function applyEdit(baseText, value, dec) {
  const lines = baseText.split(/\r?\n/);
  const edited = [];
  const touched = [];
  const replacement = dec.replaceWith ? dec.replaceWith(value) : `time_to_die>=${value}`;
  for (const line of lines) {
    if (dec.lineFilter(line) && dec.pattern.test(line)) {
      const before = line;
      const after = replacement === null ? line : line.replace(dec.pattern, replacement);
      edited.push(after);
      touched.push({ before: before.trim(), after: after.trim() });
    } else {
      edited.push(line);
    }
  }
  return { text: edited.join('\n'), touched };
}

function runSimc(profilePath, scenario, iters) {
  const jsonPath = join(TMP, `ab_${scenario.id}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const args = [
    profilePath,
    `iterations=${iters}`,
    'threads=8',
    `fight_style=${scenario.fightStyle}`,
    `max_time=${scenario.maxTime}`,
    `desired_targets=${scenario.targets}`,
    `json2=${jsonPath}`,
  ];
  return new Promise((res, rej) => {
    const p = spawn(SIMC, args, { cwd: SIMC_DIR });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', rej);
    p.on('close', (code) => {
      if (code !== 0 || !existsSync(jsonPath)) return rej(new Error(`simc ${code}: ${out.slice(-300)}`));
      res(JSON.parse(readFileSync(jsonPath, 'utf8')));
    });
  });
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** 差值保守误差上限；任一 CI 缺失、为 0 或非有限值就返回 null。 */
function conservativeDeltaCiPct(on, off) {
  if (!Number.isFinite(on?.mean) || !Number.isFinite(off?.mean) || off.mean <= 0) return null;
  if (!Number.isFinite(on?.ci95Pct) || !Number.isFinite(off?.ci95Pct) || on.ci95Pct <= 0 || off.ci95Pct <= 0) return null;
  const ciOnAbs = on.mean * on.ci95Pct / 100;
  const ciOffAbs = off.mean * off.ci95Pct / 100;
  return (ciOnAbs + ciOffAbs) / off.mean * 100;
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const baseFile = join(ROOT, PROFILE);
  const baseText = readFileSync(baseFile, 'utf8');

  const which = argOf('decision', 'vt');
  const active = which === 'control' ? CONTROL : which === 'aoe' ? AOE : which === 'burst' ? BURST : DECISION;
  const results = [];
  for (const value of active.values) {
    const { text, touched } = applyEdit(baseText, value, active);
    if (touched.length === 0) {
      console.error('没有匹配到任何 APL 行，决策定义写错了');
      process.exit(2);
    }
    const variantFile = join(TMP, `${active.id}_${value}.simc`);
    writeFileSync(variantFile, text);
    for (const scenario of SCENARIOS) {
      process.stdout.write(`${String(value).padStart(2)}s  ${scenario.id.padEnd(5)} ... `);
      const j = await runSimc(variantFile, scenario, ITERS);
      const s = j.sim?.statistics?.raid_dps;
      if (!s?.mean) {
        console.log('无结果');
        continue;
      }
      const n = s.count ?? ITERS;
      const ci = s.std_dev ? (1.96 * s.std_dev) / Math.sqrt(n) : null;
      const runId = `dec_${active.id}_${value}__${scenario.id}__${ITERS}`;
      const rec = {
        runId,
        layer: 'A',
        kind: 'decision-ab',
        hero: HERO,
        profileId: HERO,
        profileFile: PROFILE,
        decisionId: active.id,
        decisionLabel: active.label,
        value,
        baseValue: active.baseValue,
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        fightStyle: scenario.fightStyle,
        targets: scenario.targets,
        durationSec: scenario.maxTime,
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
        edit: { lines: touched, pattern: active.pattern.source, appliedValue: value },
        generatedAt: new Date().toISOString(),
      };
      writeFileSync(join(OUT_DIR, `${runId}.json`), JSON.stringify(rec, null, 2) + '\n');
      results.push(rec);
      console.log(`DPS ${fmt(rec.dps.mean)} ±${rec.dps.ci95Pct}%`);
    }
  }

  // 每个场景以 baseValue 为基线算差值
  const out = { decision: active, generatedAt: new Date().toISOString(), runs: results, deltas: [] };
  for (const scenario of SCENARIOS) {
    const rows = results.filter((r) => r.scenarioId === scenario.id);
    const base = rows.find((r) => r.value === active.baseValue) ?? rows[0];
    if (!base) continue;
    for (const r of rows) {
      const ciPct = conservativeDeltaCiPct(r.dps, base.dps);
      out.deltas.push({
        scenarioId: scenario.id,
        value: r.value,
        baseValue: base.value,
        deltaPct: ciPct == null ? null : Math.round(((r.dps.mean - base.dps.mean) / base.dps.mean) * 10000) / 100,
        ciPct: ciPct == null ? null : Math.round(ciPct * 100) / 100,
        runId: r.runId,
        baseRunId: base.runId,
      });
    }
  }
  console.log(`\n=== ${active.label} · 相对基准值 ${active.baseValue} 的差值 ===`);
  for (const scenario of SCENARIOS) {
    const rows = out.deltas.filter((d) => d.scenarioId === scenario.id).sort((a, b) => a.value - b.value);
    console.log(`\n${scenario.label}`);
    for (const d of rows) {
      console.log(d.deltaPct == null
        ? `  ≥${String(d.value).padStart(2)}s  CI 不完整，不出差值结论`
        : `  ≥${String(d.value).padStart(2)}s  ${(d.deltaPct > 0 ? '+' : '') + d.deltaPct}% · 保守误差上限 ±${d.ciPct}%`);
    }
  }
  console.log(`\n写出 ${results.length} 个决策 runId`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
