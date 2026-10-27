/**
 * 杠杆（leverage）：把某个技能从 APL 里禁掉，看 DPS 掉多少。
 *
 * 这回答的是"优先级表第 N 位到底值多少"，而不是"它排第几"。
 * 禁用方式：把所有 `actions.*=/<skill>` 行注释掉（行首加 #），其余不动。
 *
 * 注意：禁用 A 之后 B 可能补上（例如禁掉 vampiric_touch，tentacle_slam 仍会补 VT），
 * 所以这个数读作"少这一个技能、其他照常打"的代价，不是"这个技能的全部贡献"。
 *
 * 用法：
 *   node scripts/leverage.mjs                      # 默认 archon profile，两个场景
 *   node scripts/leverage.mjs --only halo          # 只测一个技能（自检用）
 *   node scripts/leverage.mjs --iters 3000
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMC_DIR = join(ROOT, '.tools', 'simc');
const SIMC = join(SIMC_DIR, 'simc.exe');
const TMP = join(ROOT, '.tools', 'tmp');
const SIMS = join(ROOT, 'content', 'sims');
const ANALYSIS = join(ROOT, 'content', 'analysis');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const ITERS = Number(argOf('iters', 3000));
const PROFILE = argOf('profile', 'content/profiles/MID2_shadow_archon.simc');
const HERO = argOf('hero', 'archon');
const ONLY = argOf('only', null);

/** 场景：单体长战斗 + M+ 波次 */
const SCENARIOS = [
  { id: 'st300', label: '单体 300s', fightStyle: 'Patchwerk', targets: 1, maxTime: 300 },
  { id: 'w30_5', label: '5 目标 30s', fightStyle: 'Patchwerk', targets: 5, maxTime: 30 },
];

/** 不测试的技能：保命、位移、非伤害，或禁掉会让循环直接跑不动 */
const SKIP = new Set([
  'fade', 'desperate_prayer', 'power_word_shield', 'dispersion', 'power_word_fortitude',
  'angelic_feather', 'levitate', 'mind_soothe', 'mass_dispel', 'purify_disease',
  'shadowform', 'shadow_priest', 'arcane_torrent', 'use_item', 'use_items',
  'potion', 'fireblood', 'berserking', 'blood_fury', 'ancestral_call', 'invoke_external_buff',
  'call_action_list', 'run_action_list', 'variable', 'variables', 'start_action_list',
]);

function profileActionSkills(text) {
  const skills = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^actions(?:\.[a-z_]+)?\+=?\/([a-z_0-9]+)/i);
    if (!m) continue;
    const s = m[1].toLowerCase();
    if (SKIP.has(s)) continue;
    skills.add(s);
  }
  return [...skills].sort();
}

function disableSkill(text, skill) {
  const lines = text.split(/\r?\n/);
  let touched = 0;
  const out = lines.map((line) => {
    const m = line.match(/^actions(?:\.[a-z_]+)?\+=?\/([a-z_0-9]+)/i);
    if (m && m[1].toLowerCase() === skill) {
      touched += 1;
      return `# [leverage:${skill}] ${line}`;
    }
    return line;
  });
  return { text: out.join('\n'), touched };
}

function runSimc(profilePath, scenario) {
  const jsonPath = join(TMP, `lev_${scenario.id}_${Date.now()}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const args = [
    profilePath,
    `iterations=${ITERS}`,
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
      if (code !== 0 || !existsSync(jsonPath)) return rej(new Error(`simc ${code}: ${out.slice(-400)}`));
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

const fmt = (n) => Math.round(n).toLocaleString('en-US');

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(ANALYSIS, { recursive: true });
  mkdirSync(SIMS, { recursive: true });

  const profilePath = join(ROOT, PROFILE);
  const baseText = readFileSync(profilePath, 'utf8');
  const skills = ONLY ? [ONLY] : profileActionSkills(baseText);
  console.log(`profile=${PROFILE} hero=${HERO} 技能 ${skills.length} 个 · ${ITERS} 迭代 · 场景 ${SCENARIOS.length}`);

  // 基线
  const baseline = {};
  for (const sc of SCENARIOS) {
    process.stdout.write(`基线 ${sc.id.padEnd(6)} ... `);
    const j = await runSimc(profilePath, sc);
    const s = statsOf(j);
    if (!s) {
      console.log('无结果');
      continue;
    }
    baseline[sc.id] = s;
    console.log(`DPS ${fmt(s.mean)} ±${s.ci95Pct}%`);
    writeFileSync(
      join(SIMS, `lev_base__${sc.id}__${ITERS}.json`),
      JSON.stringify({
        runId: `lev_base__${sc.id}__${ITERS}`, layer: 'A', kind: 'leverage-baseline', hero: HERO,
        scenarioId: sc.id, scenarioLabel: sc.label, durationSec: sc.maxTime, targets: sc.targets,
        dps: s, simc: { version: j.version ?? null, gitRevision: j.git_revision ?? null },
        generatedAt: new Date().toISOString(),
      }, null, 2) + '\n',
    );
  }

  const rows = [];
  for (const skill of skills) {
    const { text, touched } = disableSkill(baseText, skill);
    if (!touched) continue;
    const variantPath = join(TMP, `lev_${skill}.simc`);
    writeFileSync(variantPath, text);
    for (const sc of SCENARIOS) {
      const base = baseline[sc.id];
      if (!base) continue;
      process.stdout.write(`禁 ${skill.padEnd(24)} ${sc.id.padEnd(6)} ... `);
      let j;
      try {
        j = await runSimc(variantPath, sc);
      } catch (e) {
        console.log('失败', String(e).slice(0, 80));
        continue;
      }
      const s = statsOf(j);
      if (!s) { console.log('无结果'); continue; }
      const deltaPct = ((s.mean - base.mean) / base.mean) * 100;
      const ciPct = (s.ci95Pct ?? 0) + (base.ci95Pct ?? 0);
      const runId = `lev_${skill}__${sc.id}__${ITERS}`;
      const rec = {
        runId, layer: 'A', kind: 'leverage', hero: HERO, skill,
        scenarioId: sc.id, scenarioLabel: sc.label, durationSec: sc.maxTime, targets: sc.targets,
        disabledLines: touched,
        dps: s, baselineDps: base,
        deltaPct: Math.round(deltaPct * 100) / 100,
        deltaCiPct: Math.round(ciPct * 100) / 100,
        /** 差值超出两倍误差带才算"真的有影响" */
        beyondCi: Math.abs(deltaPct) > ciPct,
        simc: { version: j.version ?? null, gitRevision: j.git_revision ?? null },
        generatedAt: new Date().toISOString(),
      };
      writeFileSync(join(SIMS, `${runId}.json`), JSON.stringify(rec, null, 2) + '\n');
      rows.push(rec);
      console.log(`Δ ${deltaPct.toFixed(2)}% ±${ciPct.toFixed(2)}%`);
    }
  }

  const doc = {
    hero: HERO,
    profile: PROFILE,
    iterations: ITERS,
    method:
      '逐技能从 APL 注释掉该技能的全部动作行，重跑同一场景；差值 = 禁用后 DPS 相对基线。' +
      '读法：这是「少这一个技能、其他照常打」的代价，不是它的全部伤害占比。',
    scenarios: SCENARIOS.map((s) => ({ id: s.id, label: s.label, targets: s.targets, maxTime: s.maxTime })),
    baseline,
    rows: rows.sort((a, b) => a.deltaPct - b.deltaPct),
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(ANALYSIS, `leverage-${HERO}.json`), JSON.stringify(doc, null, 1) + '\n');
  console.log(`\n写出 content/analysis/leverage-${HERO}.json（${rows.length} 条）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
