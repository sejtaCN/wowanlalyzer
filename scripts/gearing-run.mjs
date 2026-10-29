/**
 * 配装分析：次级属性 / 附魔 / 特效在不同输出模型里的贡献。
 *
 * 为什么单独一个脚本：`sims-run.mjs` 回答"这一档打多少"，这个回答"同一件东西
 * 换个输出模型还值多少"——属性权重不是常数，附魔和特效也不是。
 *
 * 两类手段：
 *   1) 次级属性 → SimC `calculate_scale_factors`（每点 rating 换多少 DPS），
 *      折算成"每 700 点（约一颗宝石当量）涨百分之几"，按模型分开。
 *   2) 附魔 / 消耗品 / 饰品 → 从 profile 里摘掉那一样再跑，算掉多少（A/B）。
 *      口径：饰品是"整套贡献＝属性 + 特效"，不是纯特效；页面上必须写清。
 *
 * 阳性对照：整把主手武器摘掉必须掉一大截——不掉说明仪器没在测东西。
 *
 * 用法：
 *   node scripts/gearing-run.mjs                      # 默认 3000 迭代 × 4 模型
 *   node scripts/gearing-run.mjs --iters 5000
 *   node scripts/gearing-run.mjs --only st            # 只跑一个模型（调试用）
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMC_DIR = join(ROOT, '.tools', 'simc');
const SIMC = join(SIMC_DIR, 'simc.exe');
const SIMS_DIR = join(ROOT, 'content', 'sims');
const OUT = join(ROOT, 'content', 'analysis', 'gearing-archon.json');
const TMP = join(ROOT, '.tools', 'tmp');
const PROFILE = join(ROOT, 'content', 'profiles', 'MID2_shadow_archon.simc');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const ITERS = Number(argOf('iters', 3000));
const ONLY = argOf('only', null);
const REUSE = argv.includes('--reuse');

/** 输出模型：与章节里的波次模型一一对应，少的只跑这 4 个（够回答配装问题，不烧时间） */
const SCENARIOS = [
  { id: 'st', label: '单体 300s', fightStyle: 'Patchwerk', targets: 1, maxTime: 300 },
  { id: 't3', label: '3 目标 300s', fightStyle: 'Patchwerk', targets: 3, maxTime: 300 },
  { id: 't8', label: '8 目标 300s（大波）', fightStyle: 'Patchwerk', targets: 8, maxTime: 300 },
  { id: 'add5', label: '5 小怪 30s（ADD 窗口）', fightStyle: 'Patchwerk', targets: 5, maxTime: 30 },
];

/**
 * 变体：每个变体只从 profile 里拿走一样东西。
 * 正则都锚在行首，避免误伤 APL 里的同名技能。
 */
const VARIANTS = [
  { id: 'base', label: '基线（全装）', kind: 'base', apply: (t) => t },
  // 用户口径：附魔只看武器，不看头/肩/胸/腿/戒指
  { id: 'enchant_main_hand', label: '武器附魔', kind: 'enchant', apply: (t) => t.replace(/,enchant_id=8041/g, '') },
  { id: 'weapon_oil', label: '武器油（临时附魔）', kind: 'consumable', apply: (t) => t.replace(/^temporary_enchant=.*\n/m, '') },
  // 美化：crafted 装备上的 bonus_id（本 profile 挂在手腕与腰），口径含该 bonus 的全部效果
  { id: 'embellishment', label: '美化（手腕 + 腰）', kind: 'embellishment', apply: (t) => t.replace(/,bonus_id=8793\/12384/g, '') },
  { id: 'trinket_1', label: '饰品 1 · 唤浪者海石', kind: 'trinket', apply: (t) => t.replace(/^trinket1=.*$/m, 'trinket1=') },
  { id: 'trinket_2', label: '饰品 2 · 走私者药瓶', kind: 'trinket', apply: (t) => t.replace(/^trinket2=.*$/m, 'trinket2=') },
  // 套装：SimC 支持关掉某件套装效果（set_bonus=...=0 实测生效），据此量出单件套装的价值
  {
    id: 'set_4pc_off',
    label: '4 件套效果（关掉）',
    kind: 'set',
    apply: (t) => t.replace(/^(priest=.*)$/m, '$1\nset_bonus=midnight_season_2_4pc=0'),
  },
  {
    id: 'set_2pc_off',
    label: '2 件套效果（关掉）',
    kind: 'set',
    apply: (t) => t.replace(/^(priest=.*)$/m, '$1\nset_bonus=midnight_season_2_2pc=0'),
  },
  // 阳性对照：整把武器拿掉，必定大掉；不掉说明这套 A/B 没在测东西
  { id: 'control_main_hand', label: '阳性对照：整把主手武器', kind: 'control', apply: (t) => t.replace(/^main_hand=.*$/m, 'main_hand=') },
];


const PROJECT_FILE = join(TMP, 'gearing-profile.simc');

function runSimc(variantText, scenario, withScaleFactors) {
  writeFileSync(PROJECT_FILE, variantText);
  const jsonPath = join(TMP, `gear__${scenario.id}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const args = [
    PROJECT_FILE,
    `iterations=${ITERS}`,
    'threads=8',
    `fight_style=${scenario.fightStyle}`,
    `max_time=${scenario.maxTime}`,
    `desired_targets=${scenario.targets}`,
    // 只有基线要属性权重；A/B 变体只要 DPS，带上 scale factors 会白跑 8 倍
    ...(withScaleFactors ? ['calculate_scale_factors=1'] : []),
    `json2=${jsonPath}`,
  ];
  return new Promise((res, rej) => {
    const p = spawn(SIMC, args, { cwd: SIMC_DIR, windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => {
      err += d.toString();
    });
    p.on('close', (code) => {
      if (code !== 0) return rej(new Error(`simc 退出码 ${code}\n${err.slice(-800)}`));
      try {
        res(JSON.parse(readFileSync(jsonPath, 'utf8')));
      } catch (e) {
        rej(new Error(`读不出 simc 的 json2：${e.message}`));
      }
    });
  });
}

const round = (v, n = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** n) / 10 ** n);

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(SIMS_DIR, { recursive: true });
  const baseText = readFileSync(PROFILE, 'utf8');
  const scenarios = ONLY ? SCENARIOS.filter((s) => s.id === ONLY) : SCENARIOS;
  const records = [];

  if (REUSE) {
    // 只重新汇总：读回已经跑好的 gear_*.json（改阈值/改文案时不必再花 5 分钟跑批）
    for (const v of VARIANTS) {
      for (const sc of scenarios) {
        const f = join(SIMS_DIR, `gear_${v.id}__${sc.id}__${ITERS}.json`);
        if (!existsSync(f)) throw new Error(`--reuse 缺文件：${f}（先用不带 --reuse 的同一 --iters 跑一次）`);
        records.push(JSON.parse(readFileSync(f, 'utf8')));
      }
    }
    console.log(`复用 ${records.length} 个已有 runId，只重算汇总`);
  }

  for (const sc of REUSE ? [] : scenarios) {
    for (const v of VARIANTS) {
      const startedAt = new Date().toISOString();
      const j = await runSimc(v.apply(baseText), sc, v.kind === 'base');
      const player = j.sim.players[0];
      const dps = player.collected_data.dps;
      const n = dps?.count ?? j.sim.options?.iterations ?? ITERS;
      const mean = dps.mean;
      const ci95 = dps.mean_std_dev != null ? 1.96 * dps.mean_std_dev : null;
      const runId = `gear_${v.id}__${sc.id}__${ITERS}`;
      const rec = {
        runId,
        layer: 'G',
        kind: 'gearing',
        variant: v.id,
        variantLabel: v.label,
        variantKind: v.kind,
        profileId: 'archon',
        profileFile: 'content/profiles/MID2_shadow_archon.simc',
        scenarioId: sc.id,
        scenarioLabel: sc.label,
        fightStyle: sc.fightStyle,
        targets: sc.targets,
        durationSec: sc.maxTime,
        iterations: j.sim.options?.iterations ?? ITERS,
        dps: {
          mean: round(mean),
          ci95: round(ci95),
          ci95Pct: ci95 != null && mean ? round((ci95 / mean) * 100) : null,
          stdDev: round(dps.mean_std_dev),
          samples: n,
        },
        simc: {
          version: j.version ?? null,
          gitBranch: j.git_branch ?? null,
          gitRevision: j.git_revision ?? null,
          buildDate: j.build_date ?? null,
        },
        // 只有基线带属性权重：这是 calculate_scale_factors 的输出
        scaleFactors: v.kind === 'base' ? player.scale_factors ?? null : undefined,
        generatedAt: startedAt,
      };
      writeFileSync(join(SIMS_DIR, `${runId}.json`), JSON.stringify(rec, null, 2) + '\n');
      records.push(rec);
      console.log(
        `${sc.id.padEnd(5)} ${v.id.padEnd(20)} DPS ${Math.round(mean).toLocaleString('en-US').padStart(9)}  ±${rec.dps.ci95Pct ?? '—'}%`,
      );
    }
  }

  // ---- 汇总 ----
  const byScenario = {};
  for (const sc of scenarios) byScenario[sc.id] = records.filter((r) => r.scenarioId === sc.id);
  const baselineOf = (sid) => byScenario[sid].find((r) => r.variant === 'base');

  const STATS = [
    { key: 'Crit', zh: '暴击' },
    { key: 'Haste', zh: '急速' },
    { key: 'Mastery', zh: '精通' },
    { key: 'Vers', zh: '全能' },
  ];
  const PER = 700; // 一颗宝石量级（700 点 ≈ 一颗 +X 宝石），便于"换一颗值多少"直接读

  const secondary = STATS.map((st) => {
    const perPointDps = {};
    const perPerPct = {};
    for (const sc of scenarios) {
      const b = baselineOf(sc.id);
      const perPoint = b.scaleFactors?.[st.key] ?? null;
      perPointDps[sc.id] = round(perPoint, 4);
      perPerPct[sc.id] = perPoint != null && b.dps.mean ? round(((PER * perPoint) / b.dps.mean) * 100) : null;
    }
    return { stat: st.key, label: st.zh, perPointDps, perPct: perPerPct, ratingPerStep: PER };
  });

  const effects = VARIANTS.filter((v) => v.kind !== 'base' && v.kind !== 'control').map((v) => {
    const perScenario = {};
    for (const sc of scenarios) {
      const b = baselineOf(sc.id);
      const r = byScenario[sc.id].find((x) => x.variant === v.id);
      if (!b || !r) continue;
      perScenario[sc.id] = {
        runId: r.runId,
        baseRunId: b.runId,
        dps: r.dps.mean,
        deltaDps: round(r.dps.mean - b.dps.mean),
        deltaPct: round(((r.dps.mean - b.dps.mean) / b.dps.mean) * 100),
      };
    }
    return { id: v.id, label: v.label, kind: v.kind, perScenario };
  });

  const control = VARIANTS.find((v) => v.kind === 'control');
  const controlPerScenario = {};
  for (const sc of scenarios) {
    const b = baselineOf(sc.id);
    const r = byScenario[sc.id].find((x) => x.variant === control.id);
    if (b && r) {
      controlPerScenario[sc.id] = {
        runId: r.runId,
        deltaPct: round(((r.dps.mean - b.dps.mean) / b.dps.mean) * 100),
      };
    }
  }
  // 阳性对照不通过就不许写结论
  // 阈值 -10%：长窗口实测 −20% 左右，30 秒 ADD 窗口 −17%，都远超误差带（±0.2%）
  const controlOk = scenarios.every((sc) => {
    const value = controlPerScenario[sc.id]?.deltaPct;
    return Number.isFinite(value) && value <= -10;
  });

  const doc = {
    hero: 'archon',
    generatedAt: new Date().toISOString(),
    iterations: ITERS,
    scenarios: scenarios.map(({ id, label, targets, maxTime }) => ({ id, label, targets, maxTime })),
    baseline: Object.fromEntries(
      scenarios.map((sc) => {
        const b = baselineOf(sc.id);
        return [sc.id, { runId: b.runId, dps: b.dps.mean, ci95Pct: b.dps.ci95Pct, samples: b.dps.samples }];
      }),
    ),
    secondary,
    effects,
    control: { label: control.label, perScenario: controlPerScenario, passed: controlOk },
    method: {
      secondary: 'SimC calculate_scale_factors：对每个次级属性做 ±delta 重跑，得到"每 1 点 rating 换多少 DPS"；换算成每 700 点的百分比。',
      effects: '逐个从 profile 摘掉一样东西（附魔 / 武器油 / 饰品）再跑同一场景，差值 = 那样东西的整套贡献。',
      caveat: '饰品是"属性 + 特效"的整体贡献，不是纯特效；附魔同理含其属性。差值在 95% CI 内视为无结论。',
    },
    notes: [
      '属性权重不是常数：同一个属性在不同输出模型里的每 700 点收益会变，这正是按波次模型分章的理由。',
      '超过 8 只的波按 8 只计（SimC 目标上限），大波的属性收益是下限。',
    ],
  };
  writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log(`\n写出 ${records.length} 个 runId + content/analysis/gearing-archon.json`);
  console.log(`阳性对照（整把主手武器拿掉）：${controlOk ? '通过' : '不通过 —— 别信这次读数'} ${JSON.stringify(controlPerScenario)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
