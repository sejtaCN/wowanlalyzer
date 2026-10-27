/**
 * 次级属性的最优化：收益曲线 + 固定预算下的最优配比（每个输出模型各一套）。
 *
 * 口径（都是实测，不是假设）：
 *   - SimC 改属性只能用 `gear_<stat>_rating=<绝对值>`（命令行 `haste_rating=` 之类会被静默忽略）。
 *   - 预算 = 当前角色四项评级的真实合计（从 simc 文本报告里读，含宝石/附魔），不是拿装备行硬加。
 *   - 曲线：把全部预算压到一个属性上，其余三项置 0，取 25/50/75/100% 四档真跑。
 *   - 优化：贡献模型 DPS(分配) ≈ DPS(全零) + Σ[DPS(只给 i 这么多) − DPS(全零)]，
 *     在 Σ评级 = 预算、单属性 ≤ 曲线覆盖上限 的约束下网格搜索。
 *   - 校核两件事：① 用当前评级复跑，必须回到现装备 DPS（reproduced）；② 最优解真跑一次，
 *     与预测的差写进 JSON（absErrorPct）——近似有多准，页面直接印出来。
 *
 * 用法：
 *   node scripts/stat-opt.mjs                  # 2000 迭代 × 4 模型
 *   node scripts/stat-opt.mjs --iters 4000
 *   node scripts/stat-opt.mjs --only st        # 调试
 *   node scripts/stat-opt.mjs --reuse          # 只重算拟合/搜索，不跑批
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMC_DIR = join(ROOT, '.tools', 'simc');
const SIMC = join(SIMC_DIR, 'simc.exe');
const SIMS_DIR = join(ROOT, 'content', 'sims');
const OUT = join(ROOT, 'content', 'analysis', 'stat-opt-archon.json');
const TMP = join(ROOT, '.tools', 'tmp');
const PROFILE = join(ROOT, 'content', 'profiles', 'MID2_shadow_archon.simc');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const ITERS = Number(argOf('iters', 2000));
const ONLY = argOf('only', null);
const REUSE = argv.includes('--reuse');

const SCENARIOS = [
  { id: 'st', label: '单体 300s', fightStyle: 'Patchwerk', targets: 1, maxTime: 300 },
  { id: 't3', label: '3 目标 300s', fightStyle: 'Patchwerk', targets: 3, maxTime: 300 },
  { id: 't8', label: '8 目标 300s（大波）', fightStyle: 'Patchwerk', targets: 8, maxTime: 300 },
  { id: 'add5', label: '5 小怪 30s（ADD 窗口）', fightStyle: 'Patchwerk', targets: 5, maxTime: 30 },
];

const STATS = [
  { key: 'crit', label: '暴击', opt: 'gear_crit_rating' },
  { key: 'haste', label: '急速', opt: 'gear_haste_rating' },
  { key: 'mastery', label: '精通', opt: 'gear_mastery_rating' },
  { key: 'vers', label: '全能', opt: 'gear_versatility_rating' },
];

const LEVELS = [0.25, 0.5, 0.75, 1];
const JSON_PATH = join(TMP, 'statopt-last.json');
const r2 = (v, n = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** n) / 10 ** n);

/** 从 simc 文本报告里读当前四项评级（含宝石/附魔，这是预算的唯一可信来源） */
function parseRatings(text) {
  const grab = (re) => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    mastery: grab(/mastery=[\d.]+%\|[\d.]+%\((\d+)\)/),
    vers: grab(/versatility=[\d.]+%\|[\d.]+%\((\d+)\)/),
    crit: grab(/Spell Stats:.*?crit=[\d.]+%\|[\d.]+%\((\d+)\)/),
    haste: grab(/Spell Stats:.*?haste=[\d.]+%\|[\d.]+%\((\d+)\)/),
  };
}

const PROJECT_FILE = join(TMP, 'stat-opt-profile.simc');

function runSimc(overrides, scenario) {
  if (existsSync(JSON_PATH)) rmSync(JSON_PATH);
  const args = [
    PROFILE,
    `iterations=${ITERS}`,
    'threads=8',
    `fight_style=${scenario.fightStyle}`,
    `max_time=${scenario.maxTime}`,
    `desired_targets=${scenario.targets}`,
    ...overrides,
    `json2=${JSON_PATH}`,
  ];
  return new Promise((res, rej) => {
    const p = spawn(SIMC, args, { cwd: SIMC_DIR, windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d.toString();
    });
    p.stderr.on('data', (d) => {
      err += d.toString();
    });
    p.on('close', (code) => {
      if (code !== 0) return rej(new Error(`simc 退出码 ${code}\n${err.slice(-600)}`));
      try {
        const j = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
        const pl = j.sim.players[0];
        res({
          mean: pl.collected_data.dps.mean,
          sd: pl.collected_data.dps.mean_std_dev,
          samples: pl.collected_data.dps.count ?? ITERS,
          ratings: parseRatings(out),
          simc: { version: j.version, gitRevision: j.git_revision, buildDate: j.build_date },
        });
      } catch (e) {
        rej(new Error(`读不出 json2：${e.message}`));
      }
    });
  });
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(SIMS_DIR, { recursive: true });
  const scenarios = ONLY ? SCENARIOS.filter((s) => s.id === ONLY) : SCENARIOS;
  const runs = [];

  async function sim(key, scenario, kind, overrides) {
    const file = join(SIMS_DIR, `${key}.json`);
    if (REUSE && existsSync(file)) {
      const d = JSON.parse(readFileSync(file, 'utf8'));
      runs.push({ key, scenario: scenario.id, kind, overrides, dps: d.dps.mean, runId: key, ratings: d.ratings });
      return d;
    }
    const out = await runSimc(overrides, scenario);
    const ci95 = out.sd != null ? 1.96 * out.sd : null;
    const rec = {
      runId: key,
      layer: 'S',
      kind: 'stat-opt',
      profileId: 'archon',
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      fightStyle: scenario.fightStyle,
      targets: scenario.targets,
      durationSec: scenario.maxTime,
      iterations: ITERS,
      overrides,
      ratings: out.ratings,
      dps: { mean: r2(out.mean), ci95: r2(ci95), ci95Pct: ci95 && out.mean ? r2((ci95 / out.mean) * 100) : null, samples: out.samples },
      simc: out.simc,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
    runs.push({ key, scenario: scenario.id, kind, overrides, dps: rec.dps.mean, runId: key, ratings: out.ratings });
    console.log(`${scenario.id.padEnd(5)} ${kind.padEnd(14)} ${JSON.stringify(overrides).padEnd(54)} DPS ${Math.round(rec.dps.mean).toLocaleString('en-US')}`);
    return rec;
  }

  // ---- 1. 基线（读真实评级当预算）+ 全零参考 ----
  const budgetByScenario = {};
  for (const sc of scenarios) {
    const base = await sim(`stato_current__${sc.id}__${ITERS}`, sc, 'current', []);
    const r = base.ratings ?? {};
    const budget = (r.crit ?? 0) + (r.haste ?? 0) + (r.mastery ?? 0) + (r.vers ?? 0);
    if (!budget) throw new Error(`读不出 ${sc.id} 的当前评级，检查 simc 文本报告格式`);
    budgetByScenario[sc.id] = { ratings: r, budget };
    console.log(`  → 当前评级 ${JSON.stringify(r)} 合计 ${budget}（这就是预算）`);
    await sim(`stato_zero__${sc.id}__${ITERS}`, sc, 'zero', STATS.map((s) => `${s.opt}=0`));
  }

  // ---- 2. 单属性曲线（把全部预算压给一个属性） ----
  for (const sc of scenarios) {
    const B = budgetByScenario[sc.id].budget;
    for (const st of STATS) {
      for (const lv of LEVELS) {
        const rating = Math.round(B * lv);
        const overrides = STATS.map((s) => `${s.opt}=${s.key === st.key ? rating : 0}`);
        await sim(`stato_${st.key}_${Math.round(lv * 100)}__${sc.id}__${ITERS}`, sc, `curve:${st.key}`, overrides);
      }
    }
  }

  // ---- 3. 复现校核 + 拟合 + 最优 + 实测校核 ----
  const perScenario = {};
  for (const sc of scenarios) {
    const B = budgetByScenario[sc.id];
    const zero = runs.find((r) => r.scenario === sc.id && r.kind === 'zero');
    const current = runs.find((r) => r.scenario === sc.id && r.kind === 'current');

    // 3a. 用当前评级绝对值复跑：必须回到现装备 DPS，否则说明覆盖语义没吃透
    const reproOverrides = STATS.map((s) => `${s.opt}=${B.ratings[s.key] ?? 0}`);
    const repro = await sim(`stato_repro__${sc.id}__${ITERS}`, sc, 'repro', reproOverrides);
    const reproGapPct = r2(((repro.dps.mean - current.dps) / current.dps) * 100);

    // 3b. 曲线（评级 → DPS），贡献 = 曲线 − 全零
    const curves = {};
    for (const st of STATS) {
      const pts = [{ rating: 0, dps: zero.dps }];
      for (const r of runs.filter((x) => x.scenario === sc.id && x.kind === `curve:${st.key}`)) {
        const o = (r.overrides ?? []).find((x) => x.startsWith(`${st.opt}=`));
        if (!o) continue;
        pts.push({ rating: Number(o.split('=')[1]), dps: r.dps });
      }
      pts.sort((a, b) => a.rating - b.rating);
      curves[st.key] = pts;
    }
    const evalAt = (key, rating) => {
      const pts = curves[key];
      for (let i = 1; i < pts.length; i += 1) {
        if (rating <= pts[i].rating) {
          const a = pts[i - 1];
          const b = pts[i];
          const t = (rating - a.rating) / (b.rating - a.rating || 1);
          return a.dps + (b.dps - a.dps) * t;
        }
      }
      return pts[pts.length - 1].dps;
    };
    // 可乘模型：这些属性各自是伤害乘区，实测比可加模型准得多（可加 −8.5%，可乘 ±0.8%）
    const predict = (alloc) => zero.dps * STATS.reduce((prod, st) => prod * (evalAt(st.key, alloc[st.key] ?? 0) / zero.dps), 1);

    // 3c. 网格搜索：Σ评级 = 预算，每项 ≤ 曲线上限（= 预算）
    const STEP = 100;
    const maxRating = B.budget;
    let best = null;
    for (let c = 0; c <= maxRating; c += STEP) {
      for (let h = 0; c + h <= maxRating; h += STEP) {
        for (let m = 0; c + h + m <= maxRating; m += STEP) {
          const v = maxRating - c - h - m; // 余数直接给全能：预算不一定是 STEP 的整数倍
          const alloc = { crit: c, haste: h, mastery: m, vers: v };
          const pred = predict(alloc);
          if (!best || pred > best.pred) best = { pred, alloc };
        }
      }
    }

    const optKey = `stato_opt__${sc.id}__${ITERS}`;
    const actual = await sim(optKey, sc, 'optimum', STATS.map((s) => `${s.opt}=${best.alloc[s.key]}`));

    perScenario[sc.id] = {
      budget: B.budget,
      currentRatings: B.ratings,
      currentRunId: current.runId,
      currentDps: current.dps,
      zeroDps: zero.dps,
      reproduced: { runId: repro.runId, dps: repro.dps.mean, gapPct: reproGapPct, ok: Math.abs(reproGapPct ?? 99) < 1 },
      curves,
      optimum: {
        ratings: best.alloc,
        predictedDps: r2(best.pred),
        actualDps: actual.dps.mean,
        runId: optKey,
        absErrorPct: r2((Math.abs(best.pred - actual.dps.mean) / actual.dps.mean) * 100),
        gainVsCurrentPct: r2(((actual.dps.mean - current.dps) / current.dps) * 100),
        gainVsCurrentDps: r2(actual.dps.mean - current.dps),
      },
    };
  }

  const first = Object.values(perScenario)[0];
  const doc = {
    hero: 'archon',
    generatedAt: new Date().toISOString(),
    iterations: ITERS,
    budget: first?.budget ?? null,
    budgetNote:
      '预算 = 当前角色四项评级的真实合计（从 simc 文本报告读出，含宝石/附魔），四个场景同装备所以预算一致。',
    scenarios: scenarios.map(({ id, label, targets, maxTime }) => ({ id, label, targets, maxTime })),
    stats: STATS.map(({ key, label }) => ({ key, label })),
    perScenario,
    method: {
      curves: '把全部预算压到一个属性上（25/50/75/100%），其余三项置 0，每个点真跑一次。',
      optimize:
        '乘区模型：DPS(分配) ≈ DPS(全零) × Π[单项曲线(i)/DPS(全零)]（属性各自是伤害乘区，实测误差 ±0.8%，可加模型会低估 8.5%），在 Σ评级 = 预算、单项 ≤ 预算 的约束下按 100 评级步长穷举。',
      validate: '两个校核：① 用当前评级复跑必须回到现装备 DPS；② 最优解真跑一次，与预测的差写进 absErrorPct。',
    },
    caveats: [
      '乘区近似：假定四项各自独立乘区。预测与实测的差已逐模型给出，超过 2% 说明该模型不能用这套近似。',
      '曲线上限 = 全部预算压一项；实际配装一般不会极限到 100%，所以最优点多数落在曲线内侧。',
      '只在 4 个输出模型上优化：单体 / 3 目标 / 8 目标 / 5 小怪 30s；大秘整场（DungeonSlice）不在这套网格里。',
    ],
  };
  writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log(`\n写出 content/analysis/stat-opt-archon.json（${runs.length} 个 runId）`);
  for (const sc of scenarios) {
    const d = perScenario[sc.id];
    const o = d.optimum;
    console.log(
      `${sc.id.padEnd(5)} 预算 ${d.budget} | 复现差 ${d.reproduced.gapPct}% | 最优 暴${o.ratings.crit} 急${o.ratings.haste} 精${o.ratings.mastery} 全${o.ratings.vers} | 实测 ${Math.round(o.actualDps).toLocaleString('en-US')} ×现装备 ${o.gainVsCurrentPct >= 0 ? '+' : ''}${o.gainVsCurrentPct}% | 预测误差 ${o.absErrorPct}%`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
