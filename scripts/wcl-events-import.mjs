/**
 * WCL 事件表 CSV 合并导入（Time / Type / Ability / Source → Target）。
 *
 * 支持的事件类型：Cast / Begin Cast / Apply Buff / Remove Buff / Refresh Buff /
 * Apply Debuff / Refresh Debuff / Remove Debuff / Apply Debuff Stack …
 *
 * 与 wcl-table-import.mjs 的区别：那个只吃 Cast（施法节奏），这个把
 * **自身 buff（爆发窗口）** 与 **目标 debuff（DoT 覆盖率）** 也算成可核对的数字。
 *
 * 用法：
 *   node scripts/wcl-events-import.mjs --glob "C:/Users/me/Downloads/*Warcraft Logs*.csv" \
 *     --source 小花生 --out xiaohuasheng-events
 */
import { readFileSync, writeFileSync, mkdirSync, globSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'content', 'logs');
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};

const GLOB = argOf('glob', null);
const SOURCE = argOf('source', '小花生');
const OUT = argOf('out', 'wcl-events');
if (!GLOB) {
  console.error('用法：node scripts/wcl-events-import.mjs --glob "<csv 通配>" [--source 玩家名] [--out name]');
  process.exit(2);
}

/** 主 DoT 白名单 + 中英别名归一（同一技能可能中英两种写法都出现在导出里） */
const DOT_ALIAS = {
  'Vampiric Touch': '吸血鬼之触',
  'Shadow Word: Pain': '暗言术：痛',
  'Shadow Word: Madness': '暗言术：癫',
  'Horrific Vision': '惊魂幻象',
};
const DOT_ABILITIES = new Set(['吸血鬼之触', '暗言术：痛', '暗言术：癫', '惊魂幻象']);
const dotName = (n) => DOT_ALIAS[n] ?? n;
/** 爆发窗口 buff */
const BURST_BUFFS = new Set(['Voidform', '虚空形态', 'Dark Ascension', '黑暗升华']);

function normalizeAbility(raw) {
  return String(raw)
    .replace(/^\[\d+\]\s*/, '') // WCL 表格里的 [99] 前缀
    .replace(/\s+[\d.]+\s*sec\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function parseClock(s) {
  const m = /^(\d+):(\d{2})(?:\.(\d{1,3}))?$/.exec(String(s).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0) : null;
}
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length && r.some((x) => String(x).trim() !== ''));
}

/** 文件名的中间部分当作场景名（同一场景的多页会拼在一起） */
function encounterOf(file) {
  const base = basename(file).replace(/\.csv$/i, '');
  const m = /^Events - (.+?)\s{2,}\d+/.exec(base) || /^Events - (.+?)\s+\(/.exec(base);
  return (m ? m[1] : base).trim();
}

// ---------------------------------------------------------------- 读取 + 合并
const files = globSync(GLOB);
const all = [];
let raw = 0;
for (const f of files) {
  const rows = parseCsv(readFileSync(f, 'utf8'));
  if (!rows.length) continue;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const iT = head.indexOf('time');
  const iType = head.indexOf('type');
  const iAb = head.indexOf('ability');
  const iPair = head.findIndex((h) => h.includes('source'));
  if (iT < 0 || iAb < 0) continue;
  for (const r of rows.slice(1)) {
    const t = parseClock(r[iT]);
    if (t == null) continue;
    const pairRaw = iPair >= 0 ? String(r[iPair]) : '';
    const parts = pairRaw.split('→');
    const src = (parts[0] ?? '').trim();
    const tgt = (parts[1] ?? '').trim();
    if (SOURCE && src !== SOURCE) continue;
    all.push({
      t,
      type: (iType >= 0 ? String(r[iType]).trim() : 'Cast'),
      ability: normalizeAbility(r[iAb]),
      target: tgt || null,
      file: basename(f),
    });
    raw++;
  }
}

// 去重（分页边界会重复）+ 排序
const seen = new Set();
const events = [];
for (const e of all.sort((a, b) => a.t - b.t)) {
  const k = `${e.t}|${e.type}|${e.ability}|${e.target}`;
  if (seen.has(k)) continue;
  seen.add(k);
  events.push(e);
}
const dupes = all.length - events.length;

// ---------------------------------------------------------------- 切场
/**
 * 按空档切场：超过 SEGMENT_GAP 秒没有任何事件 → 新的一场。
 * 文件名不可靠（同一份报告的不同导出会被命名成不同前缀），所以不按文件名分组。
 */
const SEGMENT_GAP = 45;
const segmentsRaw = [];
let curSeg = [events[0]];
for (let i = 1; i < events.length; i++) {
  if (events[i].t - events[i - 1].t > SEGMENT_GAP) {
    segmentsRaw.push(curSeg);
    curSeg = [events[i]];
  } else {
    curSeg.push(events[i]);
  }
}
segmentsRaw.push(curSeg);

const segments = [];
let segIdx = 0;
for (const list of segmentsRaw) {
  const t0 = list[0].t;
  const t1 = list[list.length - 1].t;
  const span = Math.round((t1 - t0) * 10) / 10;
  const casts = list.filter((e) => /^cast$/i.test(e.type)).map((e) => ({ t: Math.round((e.t - t0) * 100) / 100, name: e.ability, target: e.target }));
  if (casts.length < 10 || span < 10) continue; // 只有零散 buff 的碎片不算一场
  segIdx++;
  const rel = (t) => Math.round((t - t0) * 100) / 100;

  // 爆发窗口
  const burstWindows = [];
  const open = new Map();
  for (const e of list) {
    if (!BURST_BUFFS.has(e.ability)) continue;
    if (/apply|refresh/i.test(e.type)) {
      if (!open.has(e.ability)) open.set(e.ability, e.t);
    } else if (/remove/i.test(e.type) && open.has(e.ability)) {
      burstWindows.push({ buff: e.ability, start: rel(open.get(e.ability)), end: Math.min(rel(e.t), span) });
      open.delete(e.ability);
    }
  }
  for (const [buff, s] of open) burstWindows.push({ buff, start: rel(s), end: span });

  // DoT 区间（按 技能 × 目标），并把区间裁到场内
  const bands = [];
  const bandOpen = new Map();
  for (const e of list) {
    if (!DOT_ABILITIES.has(dotName(e.ability))) continue;
    const ability = dotName(e.ability);
    const key = `${ability}|${e.target ?? '-'}`;
    if (/apply|refresh/i.test(e.type)) {
      if (!bandOpen.has(key)) bandOpen.set(key, e.t);
    } else if (/remove/i.test(e.type) && bandOpen.has(key)) {
      bands.push({ ability, target: e.target, start: rel(bandOpen.get(key)), end: rel(e.t) });
      bandOpen.delete(key);
    }
  }
  // 没有 Remove 的区间：目标死亡/消失时 WCL 常常不发 removedebuff。这类不计入覆盖率，
  // 只统计数量（诚实：宁可少算，也不要把"没关掉"当成"还挂着"）。
  const unclosed = bandOpen.size;

  const dotUptime = {};
  for (const b of bands) {
    const d = dotUptime[b.ability] ?? (dotUptime[b.ability] = { bands: 0, seconds: 0, targets: new Set() });
    d.bands += 1;
    d.seconds += Math.max(0, b.end - b.start);
    if (b.target) d.targets.add(b.target);
  }
  for (const k of Object.keys(dotUptime)) {
    const d = dotUptime[k];
    d.seconds = Math.round(d.seconds * 10) / 10;
    // 平均同时挂着几个目标 = 总覆盖秒数 / 场内时长
    d.avgTargetsCovered = span ? Math.round((d.seconds / span) * 100) / 100 : null;
    d.targetCount = d.targets.size;
    delete d.targets;
  }

  const gaps = casts.slice(1).map((c, i) => Math.round((c.t - casts[i].t) * 100) / 100);
  const gcdish = gaps.filter((g) => g >= 0.4 && g <= 1.7).sort((a, b) => a - b);
  const idle = gaps.filter((g) => g > 1.8);
  const counts = {};
  for (const c of casts) counts[c.name] = (counts[c.name] ?? 0) + 1;

  segments.push({
    index: segIdx,
    fromAbs: Math.round(t0 * 10) / 10,
    spanSec: span,
    casts: casts.length,
    castsPerMinute: Math.round((casts.length / span) * 60 * 10) / 10,
    gcdMedian: gcdish.length ? gcdish[Math.floor(gcdish.length / 2)] : null,
    activeTime: Math.round((1 - idle.reduce((a, b) => a + b, 0) / span) * 1000) / 10,
    idleCount: idle.length,
    topCasts: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12),
    burstWindows,
    dotUptime,
    dotBands: bands.length,
    dotBandsUnclosed: unclosed,
    dotBandsDetail: bands.slice(0, 600),
    series: casts.map((c) => ({ t: c.t, name: c.name, insanity: null, max: null, vf: false, target: c.target })),
    gaps,
  });
}

segments.sort((a, b) => b.spanSec - a.spanSec);
const rec = {
  runId: OUT,
  layer: 'L',
  source: 'wcl_events_csv',
  label: argOf('name', `${SOURCE} · 事件表合并`),
  sourceNote: 'WCL 事件表 CSV（Cast + Buff + Debuff），离线导入，无凭据',
  importedAt: new Date().toISOString(),
  files: files.length,
  rawEvents: raw,
  segments,
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, `${OUT}.json`), JSON.stringify(rec, null, 2) + '\n');

console.log(`写出 content/logs/${OUT}.json · ${files.length} 个文件 / ${raw} 条事件（去重 ${dupes}）/ ${segments.length} 段`);
for (const e of segments) {
  console.log(`\n【第 ${e.index} 段】${e.spanSec}s · ${e.casts} 次施法 · ${e.castsPerMinute}/分 · GCD 中位 ${e.gcdMedian}s · 活跃 ${e.activeTime}%`);
  console.log(`  爆发窗口 ${e.burstWindows.length} 个：` + e.burstWindows.slice(0, 5).map((w) => `${w.start}–${w.end}s`).join(' · '));
  const dots = Object.entries(e.dotUptime).sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 5);
  for (const [n, d] of dots) {
    console.log(`  ${n}: ${d.bands} 段 / 覆盖 ${d.seconds}s = 平均 ${d.avgTargetsCovered} 个目标（涉及 ${d.targetCount} 个目标）`);
  }
  if (e.dotBandsUnclosed) console.log(`  （另有 ${e.dotBandsUnclosed} 段没有 Remove 事件，不计入覆盖率）`);
}
