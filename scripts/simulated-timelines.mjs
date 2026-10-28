/**
 * 从 Archon 动作 trace 生成三分段模拟时间线。
 * 阶段按代表迭代的实际战斗时长均分；只描述模拟动作，不冒充真人日志阶段。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'content', 'analysis', 'play-budget-archon.json');
const OUT = join(ROOT, 'content', 'analysis', 'simulated-timelines-archon.json');
const ROLE_BY_SKILL = new Map(
  Object.entries({
    dot: ['vampiric_touch', 'shadow_word_pain', 'shadow_word_madness', 'tentacle_slam'],
    filler: ['mind_flay', 'mind_flay_insanity', 'mind_blast', 'void_volley', 'shadow_word_death'],
    burst: ['voidform', 'halo', 'power_infusion'],
    item: ['potion', 'use_items'],
  }).flatMap(([role, skills]) => skills.map((skill) => [skill, role])),
);
const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
if (source.hero !== 'archon') throw new Error(`期望 Archon 数据，实际 ${source.hero}`);

const CONFIG = [
  {
    key: 'single-target-priority',
    label: '单体 APL 裁决',
    scenarioId: 'w90_1b',
    decision: '前段先铺 DoT，再进爆发；中段按条件续 DoT、打高优先直伤；后段继续按表头逐条检查，而不是把技能名顺序当固定连招。',
  },
  {
    key: 'mid-wave',
    label: '5 目标中波',
    scenarioId: 'w30_5',
    decision: '先铺多目标 DoT，再开爆发；爆发里仍按条件补 DoT，不用单体填充硬顶。',
  },
];

function summarize(action, config) {
  const total = action.durationSec;
  const phases = Array.from({ length: 3 }, (_, i) => {
    const from = (total * i) / 3;
    const to = (total * (i + 1)) / 3;
    const rows = action.series.filter((a) => a.t >= from && (i === 2 ? a.t <= to : a.t < to));
    const counts = { dot: 0, filler: 0, burst: 0, item: 0 };
    for (const row of rows) {
      const role = ROLE_BY_SKILL.get(row.name);
      if (!role) throw new Error(`未归类动作：${row.name}`);
      counts[role] += 1;
    }
    if (counts.dot + counts.filler + counts.burst + counts.item !== rows.length) {
      throw new Error(`阶段 ${i + 1} 职责合计与动作数不一致`);
    }
    return {
      index: i + 1,
      label: i === 0 ? '起手阶段' : i === 1 ? '持续循环' : '收尾阶段',
      from: Math.round(from * 1000) / 1000,
      to: Math.round(to * 1000) / 1000,
      actions: rows.length,
      ...counts,
      byAction: rows.map((row) => ({ t: row.t, name: row.name })),
    };
  });
  return {
    key: config.key,
    label: config.label,
    scenarioId: config.scenarioId,
    runId: action.runId,
    durationSec: Math.round(total * 1000) / 1000,
    phases,
    decision: config.decision,
    evidence: `代表迭代共 ${action.actionCount} 个动作、${action.gcdStarts} 个 GCD 起手点；三个阶段分别 ${phases.map((p) => p.actions).join(' / ')} 个动作。`,
  };
}

const doc = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  hero: 'archon',
  profile: source.profile,
  source: 'content/analysis/play-budget-archon.json',
  method:
    '由 action-trace 代表迭代的动作时间、技能职责与狂乱采样推导；阶段按战斗时间均分为三段。不是日志阶段，也不代表多迭代平均。',
  timelines: CONFIG.map((c) => summarize(source.scenarios[c.scenarioId], c)),
};

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`写出 ${OUT}`);
for (const t of doc.timelines) console.log(`${t.label}: ${t.phases.map((p) => p.actions).join(' / ')} 动作`);
