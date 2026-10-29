/**
 * ADD 型（波内持续加怪）。
 *
 * 为什么不用 raid_events：本项目用的 SimC 1210-01 里 `raid_events+=/adds,...`
 * 三种写法（CLI 带斜杠 / 不带斜杠 / 写进 profile）都不生效——sim.options.raid_events 为 null，
 * 目标列表里也没有加怪。所以改用等价模型：
 *
 *   加怪窗口 = 一段时间内同时存在 N 只怪 ≈ 「N+1 目标 × 那段时长」的短战斗。
 *   3 只小怪活 12 秒 → 主目标 + 3 只 = 4 目标 12 秒。
 *
 * 这个近似会高估一点点（模型里主目标不会掉血），所以只用来比较"窗口内 vs 窗口外"的相对差异。
 *
 * 禁用爆发 / 改 AoE 阈值都用"复制 profile 改文本"（override= 在本构建里同样不生效）。
 *
 * 用法：node scripts/adds-run.mjs [--iters 3000]
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
const ANALYSIS = join(ROOT, 'content', 'analysis');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const ITERS = Number(argOf('iters', 3000));
const PROFILE = argOf('profile', 'content/profiles/MID2_shadow_archon.simc');
const HERO = argOf('hero', 'archon');

const WINDOWS = [
  { id: 'win12_1', label: '窗口 12s · 单体（无加怪）', targets: 1, maxTime: 12, kind: 'baseline' },
  { id: 'win12_4', label: '窗口 12s · 4 目标（3 只小怪）', targets: 4, maxTime: 12, kind: 'adds' },
  { id: 'win20_3', label: '窗口 20s · 3 目标（2 只小怪）', targets: 3, maxTime: 20, kind: 'adds' },
];

function editProfile(text, mode) {
  let lines = text.split(/\r?\n/);
  if (mode === 'noBurst') {
    lines = lines.map((line) => (/^actions\.cds\+?=\/voidform,/.test(line.trim()) ? `# [adds:noBurst] ${line}` : line));
  }
  if (mode === 'aoe4') {
    lines = lines.map((line) =>
      /^actions\+?=\/call_action_list,name=aoe,if=active_enemies>\d+/.test(line.trim())
        ? line.replace(/active_enemies>\d+/, 'active_enemies>4')
        : line,
    );
  }
  return lines.join('\n');
}

function runSimc(profilePath, win) {
  const jsonPath = join(TMP, `adds_${win.id}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const args = [
    profilePath,
    `iterations=${ITERS}`,
    'threads=8',
    'fight_style=Patchwerk',
    `max_time=${win.maxTime}`,
    `desired_targets=${win.targets}`,
    `json2=${jsonPath}`,
  ];
  return new Promise((res, rej) => {
    const p = spawn(SIMC, args, { cwd: SIMC_DIR });
    let log = '';
    p.stdout.on('data', (d) => (log += d));
    p.stderr.on('data', (d) => (log += d));
    p.on('error', rej);
    p.on('close', (code) => {
      if (code !== 0 || !existsSync(jsonPath)) return rej(new Error(`simc ${code}: ${log.slice(-300)}`));
      const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
      rmSync(jsonPath);
      res(j);
    });
  });
}

function stats(j) {
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

/** 差值保守误差上限；任一 CI 缺失、为 0 或非有限值就返回 null。 */
function conservativeDeltaCiPct(on, off) {
  if (!Number.isFinite(on?.mean) || !Number.isFinite(off?.mean) || off.mean <= 0) return null;
  if (!Number.isFinite(on?.ci95Pct) || !Number.isFinite(off?.ci95Pct) || on.ci95Pct <= 0 || off.ci95Pct <= 0) return null;
  const ciOnAbs = on.mean * on.ci95Pct / 100;
  const ciOffAbs = off.mean * off.ci95Pct / 100;
  return (ciOnAbs + ciOffAbs) / off.mean * 100;
}

function record({ runId, win, dps, j, edit, extra }) {
  const rec = {
    runId,
    layer: 'A',
    kind: 'adds-window',
    hero: HERO,
    profileId: HERO,
    profileFile: PROFILE,
    scenarioId: win.id,
    scenarioLabel: win.label,
    fightStyle: 'Patchwerk',
    targets: win.targets,
    durationSec: win.maxTime,
    iterations: ITERS,
    dps,
    simc: { version: j.version ?? null, gitRevision: j.git_revision ?? null },
    ...(edit ? { edit } : {}),
    ...extra,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT, `${runId}.json`), JSON.stringify(rec, null, 2) + '\n');
  return rec;
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  mkdirSync(ANALYSIS, { recursive: true });

  const baseText = readFileSync(join(ROOT, PROFILE), 'utf8');
  const variants = {
    on: join(TMP, 'adds_on.simc'),
    noBurst: join(TMP, 'adds_noburst.simc'),
    aoe4: join(TMP, 'adds_aoe4.simc'),
  };
  writeFileSync(variants.on, baseText);
  writeFileSync(variants.noBurst, editProfile(baseText, 'noBurst'));
  writeFileSync(variants.aoe4, editProfile(baseText, 'aoe4'));

  const rows = [];
  for (const win of WINDOWS) {
    process.stdout.write(`${win.id.padEnd(8)} 开爆发 ... `);
    const jOn = await runSimc(variants.on, win);
    const on = stats(jOn);
    if (!on) { console.log('无结果'); continue; }
    const rOn = record({ runId: `dec_voidform_on_1__${win.id}__${ITERS}`, win, dps: on, j: jOn });
    console.log(`${Math.round(on.mean).toLocaleString()} ±${on.ci95Pct}%`);

    process.stdout.write(`${win.id.padEnd(8)} 不开   ... `);
    const jOff = await runSimc(variants.noBurst, win);
    const off = stats(jOff);
    if (!off) { console.log('无结果'); continue; }
    const rOff = record({
      runId: `dec_voidform_on_0__${win.id}__${ITERS}`,
      win,
      dps: off,
      j: jOff,
      edit: { note: '注释掉 actions.cds 的 voidform 行（整场不施放虚空形态）' },
    });
    const delta = ((on.mean - off.mean) / off.mean) * 100;
    console.log(`${Math.round(off.mean).toLocaleString()} · 配对完成`);

    const ciPct = conservativeDeltaCiPct(on, off);
    rows.push({
      id: win.id,
      label: win.label,
      kind: win.kind,
      targets: win.targets,
      durationSec: win.maxTime,
      onDps: Math.round(on.mean),
      offDps: Math.round(off.mean),
      onCi95Pct: on.ci95Pct,
      burstDeltaPct: ciPct == null ? null : Math.round(delta * 100) / 100,
      burstDamage: ciPct == null ? null : Math.round((on.mean - off.mean) * win.maxTime),
      ciPct: ciPct == null ? null : Math.round(ciPct * 100) / 100,
      runIdOn: rOn.runId,
      runIdOff: rOff.runId,
    });
  }

  const solo = rows.find((r) => r.id === 'win12_1');
  const add4 = rows.find((r) => r.id === 'win12_4');
  const amplification = solo?.burstDamage != null && add4?.burstDamage != null
    ? Math.round((add4.burstDamage / Math.max(1, solo.burstDamage)) * 100) / 100
    : null;

  process.stdout.write('win12_4  AoE>4 ... ');
  const jAoe = await runSimc(variants.aoe4, WINDOWS[1]);
  const aoe = stats(jAoe);
  let aoeRow = null;
  if (aoe) {
    const rAoe = record({
      runId: `dec_aoe4__win12_4__${ITERS}`,
      win: WINDOWS[1],
      dps: aoe,
      j: jAoe,
      edit: { note: '把 AoE 切换条件从 active_enemies>2 改成 >4（4 目标时不切 AoE）' },
    });
    const base = rows.find((r) => r.id === 'win12_4');
    const d = base ? ((aoe.mean - base.onDps) / base.onDps) * 100 : 0;
    const ciPct = base ? conservativeDeltaCiPct(aoe, { mean: base.onDps, ci95Pct: base.onCi95Pct }) : null;
    aoeRow = {
      label: '4 目标窗口里把 AoE 切换阈值提到 >4',
      dps: Math.round(aoe.mean),
      baselineDps: base?.onDps ?? null,
      deltaPct: ciPct == null ? null : Math.round(d * 100) / 100,
      deltaCiPct: ciPct == null ? null : Math.round(ciPct * 100) / 100,
      runId: rAoe.runId,
    };
    console.log(ciPct == null ? 'CI 不完整，不出差值结论' : `${Math.round(aoe.mean).toLocaleString()} → ${d.toFixed(2)}% · 保守误差上限 ±${ciPct.toFixed(2)}%`);
  }

  const doc = {
    hero: HERO,
    profile: PROFILE,
    iterations: ITERS,
    model: 'adds-window-approximation',
    limitation:
      'SimC 1210-01 的 raid_events+=/adds 不生效（三种写法都试过，sim.options.raid_events 仍为 null），' +
      '所以用「N 只怪同时存在 = N+1 目标打同样时长」近似加怪窗口；' +
      '近似会略高估（主目标在加怪期间仍会掉血，模型里不会）。只用于比较窗口内外的相对差异。',
    method:
      '每个窗口跑"开爆发 / 不开爆发"两遍，差值＝这个窗口里爆发的价值；' +
      '再把 4 目标窗口的 AoE 切换阈值提到 >4，看"等更多怪"是否值得。' +
      '所有差值使用保守误差上限；任一 CI 不完整时不写差值结论。',
    rows,
    amplification,
    aoeThreshold: aoeRow,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(ANALYSIS, 'adds.json'), JSON.stringify(doc, null, 1) + '\n');

  console.log('\n窗口对照：');
  for (const r of rows) {
    console.log(r.burstDeltaPct == null
      ? `  ${r.label.padEnd(28)} CI 不完整，不出差值结论`
      : `  ${r.label.padEnd(28)} 开 ${r.onDps.toLocaleString().padStart(8)} / 不开 ${r.offDps
        .toLocaleString()
        .padStart(8)} → 爆发 ${r.burstDeltaPct >= 0 ? '+' : ''}${r.burstDeltaPct}% · 增量 ${(r.burstDamage / 1e6).toFixed(2)}M · 保守误差上限 ±${r.ciPct}%`);
  }
  if (amplification) console.log(`  同样 12 秒窗口：加 3 只怪让爆发增量放大 ${amplification} 倍`);
  console.log('写出 content/analysis/adds.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
