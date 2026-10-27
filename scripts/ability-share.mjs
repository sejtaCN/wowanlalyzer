/**
 * 基线技能画像：一次模拟拿到每个技能的执行次数与伤害占比。
 *
 * 用途：
 *   1. 判断某个技能在本配置里是否真的被用到（num_executes=0 → 没点/从不触发）；
 *   2. 给出伤害占比，和"禁用后掉多少"（leverage）互为对照：
 *      占比高但禁用后排不上号 = 被别的技能替代；占比为零 = 根本没参与。
 *
 * 用法：node scripts/ability-share.mjs [--iters 3000]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMC_DIR = join(ROOT, '.tools', 'simc');
const SIMC = join(SIMC_DIR, 'simc.exe');
const TMP = join(ROOT, '.tools', 'tmp');
const OUT = join(ROOT, 'content', 'analysis');

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const ITERS = Number(argOf('iters', 3000));
const PROFILE = argOf('profile', 'content/profiles/MID2_shadow_archon.simc');
const HERO = argOf('hero', 'archon');

const SCENARIOS = [
  { id: 'st300', label: '单体 300s', targets: 1, maxTime: 300 },
  { id: 'w30_5', label: '5 目标 30s', targets: 5, maxTime: 30 },
];

function runSimc(sc) {
  const jsonPath = join(TMP, `share_${sc.id}.json`);
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const args = [
    join(ROOT, PROFILE), `iterations=${ITERS}`, 'threads=8',
    'fight_style=Patchwerk', `max_time=${sc.maxTime}`, `desired_targets=${sc.targets}`,
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
      const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
      rmSync(jsonPath);
      res(j);
    });
  });
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const doc = {
    hero: HERO,
    profile: PROFILE,
    iterations: ITERS,
    method: '一次基线模拟的 per-spell 统计：执行次数 num_executes、总伤害 compound_amount；占比 = 该技能伤害 / 全部技能伤害。',
    scenarios: {},
    generatedAt: new Date().toISOString(),
  };

  for (const sc of SCENARIOS) {
    process.stdout.write(`${sc.id} ... `);
    const j = await runSimc(sc);
    const stats = j.sim?.players?.[0]?.stats ?? [];
    const rows = stats
      .filter((s) => (s.type ?? '') !== 'Aura' && s.name)
      .map((s) => {
        // num_executes 是按目标数分桶的字典（{1: 120, 5: 30}），要累加
        const ne = s.num_executes;
        const executes = typeof ne === 'object' && ne !== null
          ? Object.values(ne).reduce((a, b) => a + (Number(b) || 0), 0)
          : Number(ne ?? 0);
        return {
          spell: s.name,
          spellName: s.spell_name || s.name,
          executes: Math.round(executes),
          damage: Math.round(s.compound_amount ?? 0),
          portion: typeof s.portion_amount === 'number' ? Math.round(s.portion_amount * 10000) / 100 : null,
        };
      })
      .filter((s) => s.damage > 0 || s.executes > 0);
    const total = rows.reduce((n, s) => n + s.damage, 0) || 1;
    for (const r of rows) r.sharePct = r.portion ?? Math.round((r.damage / total) * 10000) / 100;
    rows.sort((a, b) => b.damage - a.damage);
    const dps = j.sim?.statistics?.raid_dps?.mean ?? 0;
    doc.scenarios[sc.id] = { label: sc.label, targets: sc.targets, maxTime: sc.maxTime, dps: Math.round(dps), rows };
    console.log(`${rows.length} 个技能 · DPS ${Math.round(dps).toLocaleString('en-US')} · 冠军 ${rows[0]?.spell} ${rows[0]?.sharePct}%`);
  }

  writeFileSync(join(OUT, `ability-share-${HERO}.json`), JSON.stringify(doc, null, 1) + '\n');
  console.log(`写出 content/analysis/ability-share-${HERO}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
