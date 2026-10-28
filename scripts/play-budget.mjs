/**
 * 把 trace runId 压成可教的动作预算：
 *   ① GCD 起手点数量与起手间隔（不是把动作数直接叫 GCD）
 *   ② 按技能角色拆动作数（DoT / 填充 / 爆发 / 物品）
 *   ③ 动作采样上的狂乱值收支（起点 / 峰值 / 消耗次数 / 净变化）
 *
 * 不产生新 DPS；所有数字来自 trace_<hero>__<scenario>__<iters>.json。
 * 用法：node scripts/play-budget.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMS = join(ROOT, 'content', 'sims');
const OUT = join(ROOT, 'content', 'analysis', 'play-budget-archon.json');
const HERO = 'archon';
const ITERS = 5000;
const IDS = ['w30_2', 'w30_5', 'w30_6', 'w30_7', 'w30_8', 'win12_4', 'w90_1b'];

const ROLES = [
  {
    key: 'dot',
    label: 'DoT / 续 Dot',
    skills: ['vampiric_touch', 'shadow_word_pain', 'shadow_word_madness', 'tentacle_slam'],
  },
  {
    key: 'filler',
    label: '填充 / 直伤',
    skills: ['mind_flay', 'mind_flay_insanity', 'mind_blast', 'void_volley', 'shadow_word_death'],
  },
  {
    key: 'burst',
    label: '爆发 / 增益',
    skills: ['voidform', 'halo', 'power_infusion'],
  },
  {
    key: 'item',
    label: '药水 / 饰品',
    skills: ['potion', 'use_items'],
  },
];

const ROLE_OF = new Map(ROLES.flatMap((r) => r.skills.map((s) => [s, r.key])));

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function readTrace(scenarioId) {
  const file = join(SIMS, `trace_${HERO}__${scenarioId}__${ITERS}.json`);
  assert(existsSync(file), `缺 ${file}，先跑 npm run sims:trace`);
  const d = JSON.parse(readFileSync(file, 'utf8'));
  assert(d.kind === 'action-trace', `${file} 不是 action-trace`);
  assert(d.hero === HERO, `${file} hero=${d.hero}，期望 ${HERO}`);
  assert(d.scenarioId === scenarioId, `${file} scenarioId 对不上`);
  const series = d.actions?.series ?? [];
  assert(series.length === d.actions?.total, `${scenarioId} total 与 series 长度不一致`);
  assert(series.length > 0, `${scenarioId} 没有动作序列`);
  return { d, series };
}

function summarize(scenarioId) {
  const { d, series } = readTrace(scenarioId);

  // ① GCD 起手点 = 不同动作起始时间。同刻的额外动作不重复算一个 GCD。
  const times = [...new Set(series.map((a) => Math.round(a.t * 1000) / 1000))].sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g > 0.05);
  const gcdStarts = times.length;
  const sameMomentExtras = series.length - gcdStarts;

  // ② 按角色拆动作。未知技能必须显式失败，避免新技能被悄悄丢掉。
  const counts = {};
  for (const a of series) counts[a.name] = (counts[a.name] ?? 0) + 1;
  const byRole = {};
  let assigned = 0;
  for (const r of ROLES) {
    const skills = Object.fromEntries(
      r.skills.filter((s) => counts[s]).map((s) => [s, counts[s]]),
    );
    const count = Object.values(skills).reduce((n, v) => n + v, 0);
    byRole[r.key] = { key: r.key, label: r.label, count, share: count / series.length, skills };
    assigned += count;
  }
  assert(assigned === series.length, `${scenarioId} 有 ${series.length - assigned} 个动作没有归类`);

  // ③ 动作采样上的狂乱收支。正值是动作间的回复，负值是消耗；只能读净变化。
  const vals = series.map((a) => a.insanity);
  const cap = series[0].max;
  assert(vals.every((v) => Number.isFinite(v)), `${scenarioId} 狂乱值不是数字`);
  assert(vals.every((v) => v >= 0 && v <= cap), `${scenarioId} 狂乱值越界`);
  const deltas = vals.slice(1).map((v, i) => v - vals[i]);
  const gained = deltas.filter((x) => x > 0).reduce((n, x) => n + x, 0);
  const spent = -deltas.filter((x) => x < 0).reduce((n, x) => n + x, 0);
  const net = vals[vals.length - 1] - vals[0];
  assert(Math.abs(net - (gained - spent)) < 0.35, `${scenarioId} 收支不平：net=${net} gain-spend=${gained - spent}`);

  return {
    scenarioId,
    label: d.scenarioLabel,
    targets: d.targets,
    durationSec: d.durationSec,
    observedLastActionSec: series[series.length - 1].t,
    runId: d.runId,
    dps: d.dps,
    actionCount: series.length,
    gcdStarts,
    sameMomentExtras,
    medianStartGapSec: Math.round(median(gaps) * 1000) / 1000,
    byRole,
    resource: {
      cap,
      start: vals[0],
      end: vals[vals.length - 1],
      min: Math.min(...vals),
      max: Math.max(...vals),
      samplesAtCap: vals.filter((v) => v >= cap - 0.01).length,
      spendEvents: deltas.filter((x) => x < 0).length,
      gainEvents: deltas.filter((x) => x > 0).length,
      observedGain: Math.round(gained * 10) / 10,
      observedSpend: Math.round(spent * 10) / 10,
      net: Math.round(net * 10) / 10,
    },
    series: series.map((a) => ({ t: a.t, insanity: a.insanity, name: a.name })),
    simc: d.simc,
  };
}

const scenarios = Object.fromEntries(IDS.map((id) => [id, summarize(id)]));

const doc = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  hero: HERO,
  profile: `content/profiles/MID2_shadow_${HERO}.simc`,
  method: {
    summary:
      'DPS 来自全部迭代；动作序列与狂乱值是其中一次代表迭代。GCD 起手点按不同动作起始时间去重，同刻动作不重复计数；资源按动作采样，只能读收支与峰值，不能读溢出。',
    gcd: 'gcdStarts = 去重后的动作起始时间数；medianStartGapSec = 相邻起手点的中位间隔。',
    role: '按技能在循环里的职责分组，只数动作次数，不代表伤害占比。',
    resource:
      'insanity 为动作执行后的采样值；observedGain / observedSpend = 相邻采样上涨 / 下降之和，起点与终点不是战斗开始前 / 结束后的瞬间值。',
    limit: '木桩没有位移、转火和走位；这里的 30 秒是满 uptime 上限，不是副本实际可用 GCD。',
  },
  scenarios,
};

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`写出 ${OUT}`);
for (const s of Object.values(scenarios)) {
  const roles = ROLES.map((r) => `${r.label} ${s.byRole[r.key].count}`).join(' · ');
  console.log(
    `${s.label.padEnd(14)} 动作 ${String(s.actionCount).padStart(3)} · 起手 ${String(s.gcdStarts).padStart(3)} · 间隔 ${s.medianStartGapSec}s · 狂乱 ${s.resource.start}→${s.resource.end}（峰 ${s.resource.max}，消耗 ${s.resource.spendEvents} 次）`,
  );
  console.log(`  ${roles}`);
}
