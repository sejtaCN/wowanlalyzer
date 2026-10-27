/**
 * 跑 SimC 并落成 runId 文件（数值层 A 级的唯一入口）。
 *
 * 每个 runId 保存：SimC 版本 / git commit / 分支 / 构建日期 / profile / fight_style /
 * 目标数 / 时长 / 迭代数 / DPS 均值与误差 / 生成时间。缺任何一项的数值不许进界面。
 *
 * 用法：
 *   node scripts/sims-run.mjs                # 跑默认矩阵
 *   node scripts/sims-run.mjs --iters 8000   # 覆盖迭代数
 *   node scripts/sims-run.mjs --only t3      # 只跑某场景
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMC_DIR = join(ROOT, '.tools', 'simc');
const SIMC = join(SIMC_DIR, 'simc.exe');
const OUT_DIR = join(ROOT, 'content', 'sims');
const TMP_DIR = join(ROOT, '.tools', 'tmp');

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const ITERS = Number(argOf('iters', 5000));
const ONLY = argOf('only', null);

/** 英雄天赋 A/B：两个 profile 都在 content/profiles/ 里，来源 SimC 主线 midnight */
const PROFILES = [
  { id: 'voidweaver', file: 'MID2_shadow_voidweaver.simc', label: 'Voidweaver' },
  { id: 'archon', file: 'MID2_shadow_archon.simc', label: 'Archon' },
];

/** 怪物模型：analyzer 的列 */
const SCENARIOS = [
  { id: 'st', label: '单体木桩', fightStyle: 'Patchwerk', targets: 1, maxTime: 300 },
  { id: 't2', label: '2 目标', fightStyle: 'Patchwerk', targets: 2, maxTime: 300 },
  { id: 't3', label: '3 目标', fightStyle: 'Patchwerk', targets: 3, maxTime: 300 },
  { id: 't5', label: '5 目标', fightStyle: 'Patchwerk', targets: 5, maxTime: 300 },
  { id: 't8', label: '8 目标', fightStyle: 'Patchwerk', targets: 8, maxTime: 300 },
  { id: 'add5', label: '5 小怪 30s', fightStyle: 'Patchwerk', targets: 5, maxTime: 30 },
  { id: 'mplus', label: '大秘波次', fightStyle: 'DungeonSlice', targets: 5, maxTime: 1800 },
];

function runOne(profile, scenario, iters) {
  const jsonPath = join(TMP_DIR, `${profile.id}__${scenario.id}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const args = [
    profile.file,
    `iterations=${iters}`,
    'threads=8',
    `fight_style=${scenario.fightStyle}`,
    `max_time=${scenario.maxTime}`,
    `desired_targets=${scenario.targets}`,
    `json2=${jsonPath}`,
  ];
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const p = spawn(SIMC, args, { cwd: SIMC_DIR });
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (out += d.toString()));
    p.on('error', rej);
    p.on('close', (code) => {
      if (code !== 0 || !existsSync(jsonPath)) {
        return rej(new Error(`simc 退出码 ${code}：${out.slice(-400)}`));
      }
      try {
        const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
        res({ j, elapsedMs: Date.now() - t0, raw: out });
      } catch (e) {
        rej(new Error(`JSON 解析失败：${e.message}`));
      }
    });
  });
}

const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });

/**
 * 把一次模拟的施法序列压成可核对的统计。
 * 只统计，不解释——解释归讲解层，且必须引用这里的数字。
 */
function summarizeSequence(seq) {
  const counts = {};
  for (const a of seq) {
    if (!a?.name) continue;
    counts[a.name] = (counts[a.name] ?? 0) + 1;
  }
  const byCount = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  // 完整序列：时间 / 技能 / 资源 / 目标（时间轴面板直接吃这个，不另存一份）
  const series = seq.map((a) => ({
    t: Math.round((a.time ?? 0) * 100) / 100,
    name: a.name,
    insanity: a.resources?.insanity ?? null,
    max: a.resources_max?.insanity ?? null,
    vf: (a.buffs ?? []).some((b) => b.name === 'voidform'),
    target: a.target ?? null,
  }));
  const first = seq.slice(0, 24).map((a) => ({
    t: Math.round((a.time ?? 0) * 100) / 100,
    name: a.name,
    spell: a.spell_name || a.name,
    insanity: a.resources?.insanity ?? null,
    target: a.target ?? null,
  }));
  return {
    totalActions: seq.length,
    durationApprox: seq.length ? Math.round(seq[seq.length - 1].time * 10) / 10 : 0,
    // 施法间隔（秒）：相邻两次动作的时间差，用来判断有没有空转
    gaps: seq.slice(1).map((a, i) => Math.round(((a.time ?? 0) - (seq[i].time ?? 0)) * 100) / 100),
    counts: Object.fromEntries(byCount),
    opening: first,
    series,
  };
}

async function main() {
  if (!existsSync(SIMC)) {
    console.error(`找不到 SimC：${SIMC}\n先把 nightly 解压到 .tools/simc/`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const index = [];
  for (const profile of PROFILES) {
    for (const scenario of SCENARIOS) {
      if (ONLY && scenario.id !== ONLY) continue;
      const startedAt = new Date().toISOString();
      process.stdout.write(`${profile.id.padEnd(11)} ${scenario.id.padEnd(6)} ${String(ITERS).padStart(5)} iters  ... `);
      const { j, elapsedMs } = await runOne(profile, scenario, ITERS);
      const stat = j.sim?.statistics ?? {};
      const player = j.sim?.players?.[0] ?? {};
      // SimC json2: 结果在 sim.statistics.raid_dps（单角色 = 本人 DPS）
      const dps = stat.raid_dps ?? stat.dps ?? null;
      const mean = dps?.mean;
      if (typeof mean !== 'number') {
        console.log('无 DPS 结果，跳过');
        continue;
      }
      const n = dps.count ?? ITERS;
      // 95% 置信区间 = 1.96 × 标准误；标准误 = std_dev / √n
      const ci95 = dps.std_dev ? (1.96 * dps.std_dev) / Math.sqrt(n) : null;
      const runId = `${profile.id}__${scenario.id}__${ITERS}`;
      const rec = {
        runId,
        layer: 'A',
        profileId: profile.id,
        profileFile: `content/profiles/${profile.file}`,
        profileLabel: profile.label,
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        fightStyle: scenario.fightStyle,
        targets: scenario.targets,
        durationSec: scenario.maxTime,
        iterations: j.sim?.options?.iterations ?? ITERS,
        dps: {
          mean: Math.round(mean * 100) / 100,
          ci95: ci95 != null ? Math.round(ci95 * 100) / 100 : null,
          ci95Pct: ci95 != null ? Math.round((ci95 / mean) * 10000) / 100 : null,
          stdDev: dps.std_dev != null ? Math.round(dps.std_dev * 100) / 100 : null,
          samples: n,
          min: dps.min != null ? Math.round(dps.min * 100) / 100 : null,
          max: dps.max != null ? Math.round(dps.max * 100) / 100 : null,
        },
        simc: {
          version: j.version ?? null,
          gitBranch: j.git_branch ?? null,
          gitRevision: j.git_revision ?? null,
          buildDate: j.build_date ?? null,
          buildTime: j.build_time ?? null,
        },
        // 真实触发频次：从本次模拟的施法序列统计（用于"这个判断一场触发多少次"）
        actions: summarizeSequence(player.collected_data?.action_sequence ?? []),
        spec: player.specialization ?? null,
        level: player.level ?? null,
        talentsHash: (player.talents ?? '').slice(0, 12),
        elapsedMs,
        generatedAt: startedAt,
      };
      writeFileSync(join(OUT_DIR, `${runId}.json`), JSON.stringify(rec, null, 2) + '\n');
      index.push(rec);
      console.log(`DPS ${fmt(rec.dps.mean)}  ±${rec.dps.ci95Pct}% (95% CI, n=${rec.dps.samples})  ${(elapsedMs / 1000).toFixed(1)}s`);
    }
  }

  // 汇总：同一场景下以 voidweaver 为基线算差（只算能算的）
  const byScenario = {};
  for (const r of index) (byScenario[r.scenarioId] ??= []).push(r);
  const deltas = [];
  for (const [sid, rows] of Object.entries(byScenario)) {
    const base = rows.find((r) => r.profileId === 'voidweaver');
    if (!base) continue;
    for (const r of rows) {
      if (r.profileId === 'voidweaver') continue;
      deltas.push({
        scenarioId: sid,
        key: `${r.profileId}_vs_voidweaver`,
        deltaPct: Math.round(((r.dps.mean - base.dps.mean) / base.dps.mean) * 10000) / 100,
        ciPct: Math.round((Math.hypot(r.dps.ci95 ?? 0, base.dps.ci95 ?? 0) / base.dps.mean) * 10000) / 100,
        baseRunId: base.runId,
        runId: r.runId,
      });
    }
  }
  console.log(`\n写出 ${index.length} 个 runId（${deltas.length} 条对比）`);
  for (const d of deltas) console.log(`  ${d.scenarioId.padEnd(6)} ${d.key.padEnd(24)} ${d.deltaPct > 0 ? '+' : ''}${d.deltaPct}% ±${d.ciPct}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
