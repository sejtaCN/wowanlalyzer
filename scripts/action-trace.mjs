/**
 * 动作序列留档：只回答「这一档 30 秒里到底按了什么」。
 *
 * 产出 content/sims/trace_<hero>__<scenario>__<iters>.json。
 * 每个文件同时保存：DPS 均值/95% CI（全部迭代）与一条代表迭代的动作序列。
 * 动作序列不是多迭代均值，页面上必须标明这一点。
 *
 * 用法：node scripts/action-trace.mjs [--iters 5000]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMC_DIR = join(ROOT, '.tools', 'simc');
const SIMC = join(SIMC_DIR, 'simc.exe');
const TMP = join(ROOT, '.tools', 'tmp');
const OUT = join(ROOT, 'content', 'sims');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const ITERS = Number(argOf('iters', 5000));
const HERO = argOf('hero', 'archon');
const PROFILE = argOf('profile', `content/profiles/MID2_shadow_${HERO}.simc`);
const PROFILE_ABS = join(ROOT, PROFILE);

/** 与页面分档一一对应；w90_1b 是 BOSS 档。 */
const SCENARIOS = [
  { id: 'w30_2', label: '2 目标 30s', targets: 2, maxTime: 30 },
  { id: 'w30_5', label: '5 目标 30s', targets: 5, maxTime: 30 },
  { id: 'w30_6', label: '6 目标 30s', targets: 6, maxTime: 30 },
  { id: 'w30_7', label: '7 目标 30s', targets: 7, maxTime: 30 },
  { id: 'w30_8', label: '8 目标 30s', targets: 8, maxTime: 30 },
  { id: 'win12_4', label: '4 目标 12s（加怪窗口）', targets: 4, maxTime: 12 },
  { id: 'w90_1b', label: 'BOSS 单体 90s', targets: 1, maxTime: 90 },
];

function runSimc(scenario) {
  const jsonPath = join(TMP, `trace_${scenario.id}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const args = [
    PROFILE_ABS,
    `iterations=${ITERS}`,
    'threads=1',
    'seed=104729',
    'fight_style=Patchwerk',
    `max_time=${scenario.maxTime}`,
    `desired_targets=${scenario.targets}`,
    `json2=${jsonPath}`,
  ];
  return new Promise((res, rej) => {
    const p = spawn(SIMC, args, { cwd: SIMC_DIR });
    let log = '';
    p.stdout.on('data', (d) => (log += d));
    p.stderr.on('data', (d) => (log += d));
    p.on('error', rej);
    p.on('close', (code) => {
      if (code !== 0 || !existsSync(jsonPath)) return rej(new Error(`simc ${code}: ${log.slice(-400)}`));
      const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
      rmSync(jsonPath);
      res(j);
    });
  });
}

function statsOf(j) {
  const s = j.sim?.statistics?.raid_dps;
  if (!s?.mean) return null;
  const n = s.count ?? ITERS;
  const ci = s.std_dev ? (1.96 * s.std_dev) / Math.sqrt(n) : null;
  return {
    mean: Math.round(s.mean * 100) / 100,
    ci95: ci ? Math.round(ci * 100) / 100 : null,
    ci95Pct: ci ? Math.round((ci / s.mean) * 10000) / 100 : null,
    samples: n,
  };
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const profileAbs = join(ROOT, PROFILE);
  if (!existsSync(profileAbs)) throw new Error(`找不到 profile：${PROFILE}`);

  for (const sc of SCENARIOS) {
    process.stdout.write(`${sc.label} ... `);
    const j = await runSimc(sc);
    const dps = statsOf(j);
    if (!dps) throw new Error(`${sc.id} 没有 DPS 结果`);
    const seq = j.sim?.players?.[0]?.collected_data?.action_sequence ?? [];
    if (!seq.length) throw new Error(`${sc.id} 没有 action_sequence`);
    const series = seq.map((a) => ({
      t: Math.round((a.time ?? 0) * 1000) / 1000,
      name: a.name,
      insanity: a.resources?.insanity ?? null,
      max: a.resources_max?.insanity ?? null,
    }));
    if (series.some((a) => a.insanity === null || a.max === null)) {
      throw new Error(`${sc.id} 有动作缺狂乱值，不能做资源图`);
    }
    const runId = `trace_${HERO}__${sc.id}__${ITERS}`;
    const rec = {
      runId,
      kind: 'action-trace',
      hero: HERO,
      profileId: HERO,
      profileFile: PROFILE,
      scenarioId: sc.id,
      scenarioLabel: sc.label,
      fightStyle: 'Patchwerk',
      targets: sc.targets,
      durationSec: sc.maxTime,
      iterations: j.sim?.options?.iterations ?? ITERS,
      dps,
      actions: { total: series.length, series },
      simc: {
        version: j.version ?? null,
        gitBranch: j.git_branch ?? null,
        gitRevision: j.git_revision ?? null,
        buildDate: j.build_date ?? null,
      },
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(OUT, `${runId}.json`), JSON.stringify(rec, null, 2) + '\n');
    console.log(`DPS ${Math.round(dps.mean).toLocaleString('en-US')} ±${dps.ci95Pct}% · ${series.length} 动作`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
