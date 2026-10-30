/**
 * 将 WCL Events 页面逐页导出的筛选事件，转成站点可读的战斗分段。
 *
 * 输入是浏览器默认视图抓下来的 { time, event } 数组；不使用截断的摘要，
 * 也不把路线波次与 WCL 战斗分段强行当成一一对应。
 *
 * 用法：
 *   node scripts/import-wcl-event-pages.mjs [--dungeon ruby_life_pools] [--in <raw pages.json>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
};

const MANIFEST_PATH = join(ROOT, 'content', 'logs', 'wcl-archon-sources.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const DUNGEON_SLUG = argOf('dungeon', 'ruby_life_pools');
const source = manifest.dungeons.find((dungeon) => dungeon.slug === DUNGEON_SLUG);
if (!source) throw new Error(`来源清单中找不到副本：${DUNGEON_SLUG}`);
if (source.wclStatus !== 'ready') throw new Error(`${DUNGEON_SLUG} 尚未达到 ready`);
if (!source.dataset?.events || !source.dataset?.phases) {
  throw new Error(`${DUNGEON_SLUG} 缺少 events / phases 输出路径`);
}
if (!source.pulls?.length) throw new Error(`${DUNGEON_SLUG} 缺少 WCL Pull 边界`);

const INPUT = resolve(ROOT, argOf('in', source.dataset.rawSnapshot));
const EVENTS_OUT = resolve(ROOT, source.dataset.events);
const PHASES_OUT = resolve(ROOT, source.dataset.phases);
const ROUTE_PATH = source.route?.file ? resolve(ROOT, source.route.file) : null;

const REPORT_CODE = source.wcl.reportCode;
const FIGHT_ID = source.wcl.fightId;
const REPORT_URL = source.wcl.reportUrl ?? `https://www.warcraftlogs.com/reports/${REPORT_CODE}?fight=${FIGHT_ID}`;
const PLAYER = source.wcl.player;
const PLAYER_SPEC = `${manifest.spec} (${manifest.specName})`;
const PROFILE = manifest.heroTree.toLowerCase();
const KEY_LEVEL = source.wcl.keyLevel;

const PULLS = source.pulls.map((pull) => ({
  ...pull,
  title: pull.label,
  label: `Pull ${pull.index} · ${pull.label}`,
}));

const FRIENDLIES = new Set([
  'Blastore',
  'Hoogity',
  'Gâgnon',
  'Omgcows',
  'Shadow',
  'Shadowfiend',
  'Thing From Beyond',
  'Void Lasher',
  'Void Tendril',
]);
FRIENDLIES.add(PLAYER);
for (const member of source.party ?? []) FRIENDLIES.add(member);
const DOTS = new Set(['Vampiric Touch', 'Shadow Word: Pain', 'Shadow Word: Madness', 'Horrific Visions']);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PLAYER_RE = escapeRegex(PLAYER);

const parseClock = (text) => {
  const match = /^(\d+):(\d{2})\.(\d{3})$/.exec(String(text).trim());
  return match
    ? Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 1000
    : null;
};

const round = (value, places = 2) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

const family = (name) => name.trim().replace(/\s+\d+$/, '');
const cleanTarget = (name) => name.trim().replace(/\s+/g, ' ');
const isEnemyTarget = (name) =>
  Boolean(name) && !FRIENDLIES.has(family(name)) && !new RegExp(`\\(${PLAYER_RE}\\)$`).test(name);

const targetFromEvent = (text) => {
  let match = new RegExp(` is afflicted by .+ from ${PLAYER_RE}$`).exec(text);
  if (match) return cleanTarget(text.slice(0, match.index));

  match = new RegExp(`'s (?:Vampiric Touch|Shadow Word: Pain|Shadow Word: Madness|Horrific Visions) is refreshed by ${PLAYER_RE}$`).exec(text);
  if (match) return cleanTarget(text.slice(0, match.index));

  match = new RegExp(`^${PLAYER_RE}'s (?:Vampiric Touch|Shadow Word: Pain|Shadow Word: Madness|Horrific Visions) fades from (.+)$`).exec(text);
  if (match) return cleanTarget(match[1]);

  match = new RegExp(`^${PLAYER_RE} casts .+ on (.+)$`).exec(text);
  if (match) return cleanTarget(match[1]);

  return null;
};

const castFromEvent = (text) => {
  if (!text.startsWith(`${PLAYER} casts `)) return null;
  const rest = text.slice(`${PLAYER} casts `.length);
  return rest.split(' on ')[0].trim();
};

const raw = JSON.parse(readFileSync(INPUT, 'utf8'));
const allEvents = raw.events
  .map((row) => ({ ...row, t: parseClock(row.time) }))
  .filter((row) => row.t != null)
  .sort((a, b) => a.t - b.t);

const pullOf = (time) => PULLS.find((pull) => time >= pull.from && time < pull.to) ?? null;
const overlap = (start, end, from, to) => Math.max(0, Math.min(end, to) - Math.max(start, from));

// 先把 DoT 连成整场区间，再按 WCL 的真实 Pull 边界裁切。
const openBands = new Map();
const dotBands = [];
for (const row of allEvents) {
  let match = new RegExp(`^(.+) is afflicted by (.+) from ${PLAYER_RE}$`).exec(row.event);
  if (match && DOTS.has(match[2])) {
    const key = `${match[2]}|${cleanTarget(match[1])}`;
    if (!openBands.has(key)) openBands.set(key, row.t);
    continue;
  }

  match = new RegExp(`^(.+)'s (.+) is refreshed by ${PLAYER_RE}$`).exec(row.event);
  if (match && DOTS.has(match[2])) {
    const key = `${match[2]}|${cleanTarget(match[1])}`;
    if (!openBands.has(key)) openBands.set(key, row.t);
    continue;
  }

  match = new RegExp(`^${PLAYER_RE}'s (.+) fades from (.+)$`).exec(row.event);
  if (match && DOTS.has(match[1])) {
    const key = `${match[1]}|${cleanTarget(match[2])}`;
    const start = openBands.get(key);
    if (start != null) {
      dotBands.push({ ability: match[1], target: cleanTarget(match[2]), start, end: row.t });
      openBands.delete(key);
    }
  }
}
for (const [key, start] of openBands) {
  const [ability, target] = key.split('|');
  dotBands.push({ ability, target, start, end: allEvents.at(-1).t + 0.001 });
}

const segments = PULLS.map((pull) => {
  const events = allEvents.filter((row) => row.t >= pull.from && row.t < pull.to);
  const casts = events
    .map((row) => {
      const ability = castFromEvent(row.event);
      if (!ability) return null;
      const target = targetFromEvent(row.event);
      return { t: round(row.t - pull.from), name: ability, target };
    })
    .filter(Boolean);

  const counts = {};
  for (const cast of casts) counts[cast.name] = (counts[cast.name] ?? 0) + 1;
  const gaps = casts.slice(1).map((cast, index) => round(cast.t - casts[index].t));
  const gcdish = gaps.filter((gap) => gap >= 0.4 && gap <= 1.7).sort((a, b) => a - b);
  const idle = gaps.filter((gap) => gap > 1.8);

  const burstWindows = [];
  let burstStart = null;
  for (const row of events) {
    if (row.event === `${PLAYER} gains Voidform from ${PLAYER}` && burstStart == null) {
      burstStart = row.t;
    } else if (row.event === `${PLAYER}'s Voidform fades from ${PLAYER}` && burstStart != null) {
      burstWindows.push({
        buff: 'Voidform',
        start: round(burstStart - pull.from),
        end: round(row.t - pull.from),
      });
      burstStart = null;
    }
  }
  if (burstStart != null) {
    burstWindows.push({
      buff: 'Voidform',
      start: round(burstStart - pull.from),
      end: round(pull.to - pull.from),
    });
  }

  const bands = [];
  for (const band of dotBands) {
    const start = Math.max(band.start, pull.from);
    const end = Math.min(band.end, pull.to);
    if (end <= start) continue;
    bands.push({
      ability: band.ability,
      target: band.target,
      start: round(start - pull.from),
      end: round(end - pull.from),
    });
  }

  const dotUptime = {};
  for (const band of bands) {
    const item = dotUptime[band.ability] ?? (dotUptime[band.ability] = {
      bands: 0,
      seconds: 0,
      targets: new Set(),
    });
    item.bands += 1;
    item.seconds += band.end - band.start;
    item.targets.add(band.target);
  }
  for (const item of Object.values(dotUptime)) {
    item.seconds = round(item.seconds, 1);
    item.avgTargetsCovered = round(item.seconds / (pull.to - pull.from), 2);
    item.targetCount = item.targets.size;
    delete item.targets;
  }

  const targetCounts = {};
  for (const row of events) {
    const target = targetFromEvent(row.event);
    if (!isEnemyTarget(target)) continue;
    const name = family(target);
    targetCounts[name] = (targetCounts[name] ?? 0) + 1;
  }

  return {
    index: pull.index,
    kind: pull.kind,
    label: pull.title,
    fromAbs: pull.from,
    spanSec: pull.to - pull.from,
    casts: casts.length,
    castsPerMinute: round((casts.length / Math.max(1, pull.to - pull.from)) * 60, 1),
    gcdMedian: gcdish.length ? gcdish[Math.floor(gcdish.length / 2)] : null,
    activeTime: round((1 - idle.reduce((sum, gap) => sum + gap, 0) / (pull.to - pull.from)) * 100, 1),
    idleCount: idle.length,
    topCasts: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12),
    burstWindows,
    dotUptime,
    dotBands: bands.length,
    dotBandsUnclosed: 0,
    dotBandsDetail: bands,
    series: casts,
    gaps,
    targetFamilies: Object.entries(targetCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
  };
});

const route = ROUTE_PATH ? JSON.parse(readFileSync(ROUTE_PATH, 'utf8')) : null;
const routeWaves = route ? route.waves.map((wave) => ({
  pull: wave.pull,
  mobs: wave.mobCount,
  isBoss: wave.isBoss,
  families: new Set(wave.mobs.map((mob) => family(mob.name))),
})) : [];

const phases = segments.map((segment) => {
  const families = segment.targetFamilies.slice(0, 8);
  const familySet = new Set(families.map((item) => item.name));
  const burstUptimeSec = segment.burstWindows.reduce(
    (sum, window) => sum + Math.max(0, window.end - window.start),
    0,
  );
  return {
    index: segment.index,
    kind: segment.kind,
    label: segment.label,
    from: segment.fromAbs,
    to: segment.fromAbs + segment.spanSec,
    durationSec: segment.spanSec,
    families,
    enemyCasts: 0,
    allCasts: segment.casts,
    castsPerMinute: segment.castsPerMinute,
    bursts: segment.burstWindows.length,
    burstUptimeSec: round(burstUptimeSec, 1),
  };
});

const routeMatches = {};
for (const phase of phases) {
  const families = new Set(phase.families.map((item) => item.name));
  routeMatches[String(phase.index)] = routeWaves
    .map((wave) => {
      const intersection = [...families].filter((name) => wave.families.has(name)).length;
      const union = new Set([...families, ...wave.families]).size || 1;
      return {
        pull: wave.pull,
        mobs: wave.mobs,
        isBoss: wave.isBoss,
        jaccard: round(intersection / union),
      };
    })
    .filter((wave) => wave.jaccard > 0)
    .sort((a, b) => b.jaccard - a.jaccard)
    .slice(0, 3);
}

const eventsDoc = {
  runId: source.dataset.events
    .split(/[\\/]/)
    .at(-1)
    .replace(/\.json$/, ''),
  layer: 'L',
  source: 'wcl_public_events',
  dungeonSlug: source.slug,
  wclEncounterId: source.wclEncounterId,
  label: `${PLAYER} · ${source.name} +${KEY_LEVEL}`,
  sourceUrl: REPORT_URL,
  sourceNote: `WCL 公共报告 ${REPORT_CODE} · fight ${FIGHT_ID} · ${PLAYER_SPEC} · ${PROFILE}`,
  eventFilter: source.wcl.eventFilter,
  importedAt: new Date().toISOString(),
  pages: raw.pages.length,
  rawEvents: raw.events.length,
  segments,
};

const phasesDoc = {
  runId: source.dataset.phases
    .split(/[\\/]/)
    .at(-1)
    .replace(/\.json$/, ''),
  sourceLog: eventsDoc.runId,
  dungeonSlug: source.slug,
  wclEncounterId: source.wclEncounterId,
  label: eventsDoc.label,
  sourceUrl: REPORT_URL,
  player: PLAYER,
  profile: PROFILE,
  keyLevel: KEY_LEVEL,
  method: {
    summary: `直接采用 WCL Fights 视图的 ${PULLS.length} 个真实战斗分段；施法、虚空形态和四个核心 DoT 事件来自同一份公开报告的默认事件页`,
    bucketSec: 0,
    minPhaseSec: 0,
    coWindowSec: 0,
    cohorts: {},
  },
  limitation:
    `这是单个 +${KEY_LEVEL} 执政官暗牧样本。WCL 的 ${PULLS.length} 个真实战斗分段${route ? `与 keystone.guru 的 ${route.waves.length} 波不是一一对应` : '没有绑定 keystone.guru 路线'}；路线列只表示怪物族重合成度。未筛选敌方伤害事件，因此本数据不用于伤害归因。`,
  totalSec: source.wcl.durationSec,
  phases,
  routeMatches,
  routeSource: source.route?.file ?? null,
  generatedAt: new Date().toISOString(),
};

writeFileSync(EVENTS_OUT, `${JSON.stringify(eventsDoc, null, 2)}\n`);
writeFileSync(PHASES_OUT, `${JSON.stringify(phasesDoc, null, 2)}\n`);

console.log(`写出 ${EVENTS_OUT}`);
console.log(`写出 ${PHASES_OUT}`);
console.log(`事件 ${raw.events.length} 条 / 分段 ${segments.length} 个 / DoT 区间 ${dotBands.length} 段`);
