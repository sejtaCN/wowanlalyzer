/**
 * 联动关系：技能 ↔ DoT / Buff / 资源 之间到底谁依赖谁、谁触发谁。
 *
 * 两类证据，分开标注，不混：
 *   A. apl      —— 来自 APL 的条件（`buff.voidform.up`、`dot.vampiric_touch.ticking`）
 *   B. log      —— 来自真实日志的统计（谁在 1 秒内挂上了这个 DoT；技能在爆发内的占比）
 *
 * 输出 content/analysis/interactions.json
 * 用法：node scripts/analyze-interactions.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (p) => join(ROOT, p);

const profilePath = SRC('content/profiles/MID2_shadow_archon.simc');
const logPath = SRC('content/logs/dukkie-ruby-life-pools-events.json');
const outPath = SRC('content/analysis/interactions.json');

const NAME_TO_KEY = {
  'Vampiric Touch': 'vampiric_touch',
  'Shadow Word: Pain': 'shadow_word_pain',
  'Shadow Word: Madness': 'shadow_word_madness',
  'Horrific Visions': 'horrific_visions',
  'Tentacle Slam': 'tentacle_slam',
  'Void Volley': 'void_volley',
  'Mind Blast': 'mind_blast',
  'Mind Flay': 'mind_flay',
  'Mind Flay: Insanity': 'mind_flay_insanity',
  'Shadow Word: Death': 'shadow_word_death',
  Halo: 'halo',
  Voidform: 'voidform',
  'Void Eruption': 'voidform',
  'Power Infusion': 'power_infusion',
  'Void Torrent': 'void_torrent',
  'Shadowy Apparition': 'shadowy_apparition',
  'Void Bolt': 'void_bolt',
  'Devouring Plague': 'devouring_plague',
  'Psychic Link': 'psychic_link',
};
const keyOf = (name) => NAME_TO_KEY[name] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

const ZH = JSON.parse(readFileSync(SRC('content/guides/skills.json'), 'utf8')).skills;
const zhOf = (key) => ZH[key]?.zh ?? null;

/** 中文名 → 键名（日志里的技能名是中文） */
const CN_TO_KEY = {};
for (const [k, v] of Object.entries(ZH)) if (v?.zh) CN_TO_KEY[v.zh] = k;
Object.assign(CN_TO_KEY, {
  '惊魂幻象': 'shadowy_apparition',
  '暗影幻灵': 'shadowy_apparition',
  '虚空箭': 'void_bolt',
  '精神鞭笞：狂': 'mind_flay_insanity',
  '渐隐术': 'fade',
});
const keyOfAny = (name) => NAME_TO_KEY[name] ?? CN_TO_KEY[name] ?? keyOf(name);

/* ---------------- A. APL 条件边 ---------------- */
const apl = readFileSync(profilePath, 'utf8');
const aplEdges = [];
const skillNodes = new Set();
const dotNodes = new Set();
const buffNodes = new Set();

for (const raw of apl.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line.startsWith('actions')) continue;
  const m = line.match(/^actions(?:\.[a-z_]+)?\+=?\/([a-z_0-9]+)(.*)$/i);
  if (!m) continue;
  const skill = m[1].toLowerCase();
  if (['call_action_list', 'use_items', 'use_item', 'potion', 'fade', 'desperate_prayer'].includes(skill)) continue;
  const rest = m[2];
  skillNodes.add(skill);

  for (const dm of rest.matchAll(/(?:^|[^a-z_])dot\.([a-z_0-9]+)\.(ticking|remains|refreshable)/g)) {
    dotNodes.add(dm[1]);
    aplEdges.push({
      from: skill, to: dm[1], kind: 'requires_dot',
      label: `需要 ${dm[1]} ${dm[2]}`,
      evidence: { type: 'apl', line },
    });
  }
  for (const dm of rest.matchAll(/active_dot\.([a-z_0-9]+)/g)) {
    dotNodes.add(dm[1]);
    aplEdges.push({
      from: skill, to: dm[1], kind: 'requires_dot',
      label: `按 ${dm[1]} 的覆盖目标数判断`,
      evidence: { type: 'apl', line },
    });
  }
  for (const bm of rest.matchAll(/buff\.([a-z_0-9]+)\.(up|react|stack)/g)) {
    buffNodes.add(bm[1]);
    aplEdges.push({
      from: skill, to: bm[1], kind: bm[2] === 'up' ? 'requires_buff' : 'procs_on',
      label: bm[2] === 'up' ? `需要 ${bm[1]} 存在` : `等 ${bm[1]} 触发`,
      evidence: { type: 'apl', line },
    });
  }
}

/* ---------------- B. 日志统计边 ---------------- */
const log = JSON.parse(readFileSync(logPath, 'utf8'));
const series = log.segments.flatMap((segment) =>
  segment.series
    .filter((event) => event.t != null)
    .map((event) => ({ ...event, t: segment.fromAbs + event.t })),
);
const allDotBands = log.segments.flatMap((segment) =>
  (segment.dotBandsDetail ?? []).map((band) => ({
    ...band,
    start: segment.fromAbs + band.start,
    end: segment.fromAbs + band.end,
  })),
);
const vfWindows = log.segments.flatMap((segment) =>
  segment.burstWindows
    .filter((window) => window.buff === 'Voidform')
    .map((window) => ({
      ...window,
      start: segment.fromAbs + window.start,
      end: segment.fromAbs + window.end,
    })),
);
const famOf = (t) => (t ? t.replace(/\s*\d+$/, '').trim() : '');

/** 1) DoT 是谁挂上的：只认能施加该 DoT 的主动技能，且必须命中同一目标 */
const APPLIERS = {
  vampiric_touch: new Set(['vampiric_touch', 'tentacle_slam', 'void_bolt', 'misery']),
  shadow_word_pain: new Set(['shadow_word_pain', 'tentacle_slam', 'misery']),
  shadow_word_madness: new Set(['shadow_word_madness']),
  horrific_visions: new Set(['horrific_visions', 'shadowy_apparition']),
  devouring_plague: new Set(['devouring_plague']),
};
const applier = {};
let unattributed = 0;
for (const band of allDotBands) {
  if (!band.start) continue;
  const dotKeyGuess = keyOfAny(band.ability);
  const allow = APPLIERS[dotKeyGuess];
  // 只统计能确认的四种 DoT；目标名与短窗口必须同时匹配。
  if (!allow) { unattributed += 1; continue; }
  const before = series.filter(
    (e) =>
      e.t <= band.start + 0.15 &&
      e.t >= band.start - 0.6 &&
      allow.has(keyOfAny(e.name)) &&
      (!e.target || !band.target || famOf(e.target) === famOf(band.target)),
  );
  if (!before.length) { unattributed += 1; continue; }
  const cast = before[before.length - 1];
  const key = keyOfAny(cast.name);
  const dotKey = keyOfAny(band.ability);
  const k = `${key}->${dotKey}`;
  applier[k] = applier[k] ?? { from: key, to: dotKey, count: 0 };
  applier[k].count += 1;
}
const applyEdges = Object.values(applier)
  .sort((a, b) => b.count - a.count)
  .slice(0, 12)
  .filter((e) => e.from !== e.to || e.count > 0)
  .map((e) => ({
    ...e, kind: 'applies_dot',
    label: `挂上 ${e.to}：${e.count} 次`,
    evidence: { type: 'log', detail: `DoT 条带开始前 0.6s 内、命中同目标的施加技能（样本 ${allDotBands.length} 条，未归因 ${unattributed} 条）` },
  }));

/** 2) 技能在爆发窗口内的占比（series 的 vf 标志） */
const inBurst = (t) => vfWindows.some((w) => t >= w.start && t <= w.end);
const castsBySkill = {};
for (const e of series) {
  const k = keyOfAny(e.name);
  castsBySkill[k] = castsBySkill[k] ?? { total: 0, inVf: 0 };
  castsBySkill[k].total += 1;
  if (inBurst(e.t)) castsBySkill[k].inVf += 1;
}
const burstEdges = Object.entries(castsBySkill)
  .filter(([, v]) => v.total >= 20)
  .map(([k, v]) => ({
    from: k, to: 'voidform', kind: 'cast_in_burst',
    label: `${Math.round((v.inVf / v.total) * 100)}% 在爆发内（${v.inVf}/${v.total}）`,
    weight: v.inVf / v.total,
    evidence: { type: 'log', detail: `按虚空形态窗口时间区间判定（共 ${vfWindows.length} 段）` },
  }))
  .sort((a, b) => b.weight - a.weight)
  .slice(0, 12);

/** 3) 爆发前 3 秒的施法序列（他的真实起手） */
const openers = [];
for (const w of vfWindows) {
  const pre = series.filter((e) => e.t >= w.start - 3 && e.t <= w.start + 2).map((e) => keyOfAny(e.name));
  if (pre.length) openers.push(pre);
}
const openerCount = {};
for (const seq of openers) for (const k of seq) openerCount[k] = (openerCount[k] ?? 0) + 1;
const openerEdges = Object.entries(openerCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([k, n]) => ({
    from: k, to: 'voidform', kind: 'opener_before_burst',
    label: `${n}/${openers.length} 次爆发前 3 秒内出现`,
    evidence: { type: 'log', detail: `${vfWindows.length} 个虚空形态窗口，取窗口前 3 秒到后 2 秒的施法` },
  }));

/* ---------------- 汇总 ---------------- */
const nodes = new Map();
const addNode = (id, kind, extra = {}) => {
  if (!nodes.has(id)) {
    nodes.set(id, {
      id, kind,
      zh: zhOf(id) ?? (kind === 'dot' || kind === 'buff' ? null : null),
      en: id,
      ...extra,
    });
  }
  return nodes.get(id);
};
for (const s of skillNodes) addNode(s, 'skill');
for (const d of dotNodes) addNode(d, 'dot');
for (const b of buffNodes) addNode(b, 'buff');
for (const e of [...applyEdges, ...burstEdges, ...openerEdges]) {
  addNode(e.from, 'skill');
  addNode(e.to, nodes.get(e.to)?.kind ?? (e.to === 'voidform' ? 'buff' : 'skill'));
}
// 日志里出现但 APL 没有的技能也标出来（例如暗影幻灵属于被动）
for (const k of Object.keys(castsBySkill)) if (!nodes.has(k) && castsBySkill[k].total >= 20) addNode(k, 'skill');
for (const k of ['vampiric_touch', 'shadow_word_pain', 'shadow_word_madness', 'horrific_visions', 'devouring_plague']) {
  if (nodes.has(k)) nodes.get(k).kind = 'dot';
}
for (const k of ['voidform', 'resonant_energy', 'void_apparitions']) {
  if (nodes.has(k)) nodes.get(k).kind = 'buff';
}

/** 去重：同一对 (from,to,kind) 只留第一条证据 */
const seen = new Set();
const edges = [...aplEdges, ...applyEdges, ...burstEdges, ...openerEdges].filter((e) => {
  const k = `${e.from}|${e.to}|${e.kind}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return nodes.has(e.from) && nodes.has(e.to) && e.from !== e.to;
});

const doc = {
  hero: 'archon',
  profile: 'content/profiles/MID2_shadow_archon.simc',
  logId: log.runId,
  method:
    'APL 边＝条件依赖（可复现）；日志边＝真实施法统计（applies=DoT 条带开始前 1s 的施法；' +
    'cast_in_burst=施法瞬间是否在虚空形态；opener=爆发窗口前 3s 的施法）',
  counts: { apl: aplEdges.length, applies: applyEdges.length, burst: burstEdges.length, opener: openerEdges.length },
  nodes: [...nodes.values()],
  edges,
  generatedAt: new Date().toISOString(),
};

mkdirSync(SRC('content/analysis'), { recursive: true });
writeFileSync(outPath, JSON.stringify(doc, null, 1) + '\n');

console.log(`节点 ${doc.nodes.length} 个（技能 ${doc.nodes.filter((n) => n.kind === 'skill').length} / DoT ${doc.nodes.filter((n) => n.kind === 'dot').length} / Buff ${doc.nodes.filter((n) => n.kind === 'buff').length}）`);
console.log(`边 ${edges.length} 条：APL ${doc.counts.apl} · 挂 DoT ${doc.counts.applies} · 爆发内 ${doc.counts.burst} · 起手 ${doc.counts.opener}`);
console.log('\n挂 DoT 的实际来源：');
for (const e of applyEdges.slice(0, 6)) console.log(`  ${e.from} → ${e.to}  ${e.count} 次`);
console.log('\n爆发内占比最高的技能：');
for (const e of burstEdges.slice(0, 6)) console.log(`  ${e.from}: ${e.label}`);
