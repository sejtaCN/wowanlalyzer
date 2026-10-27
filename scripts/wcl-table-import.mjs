/**
 * WCL「事件表」CSV 导入（Time / Type / Ability / Source → Target 四列格式）。
 *
 * 这是 WCL 报告页 Events 表格的 Export 产物：每页 600 行，多页拼起来可以覆盖整场。
 * 吃的是 UI 表格导出（人读的名字 + 相对时间），不需要任何凭据。
 *
 * 用法：
 *   node scripts/wcl-table-import.mjs --glob "C:/Users/me/Downloads/*Warcraft Logs*.csv" \
 *     --source 小花生 --out xiaohuasheng --name "小花生 · The Writhing Coil"
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'content', 'logs');
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};

const GLOB = argOf('glob', null);
const SOURCE = argOf('source', null);
const OUT = argOf('out', 'wcl-table');
const LABEL = argOf('name', OUT);
if (!GLOB) {
  console.error('用法：node scripts/wcl-table-import.mjs --glob "<csv 通配>" [--source 玩家名] [--out name]');
  process.exit(2);
}

/** "12:34.567" → 754.567 秒 */
function parseClock(s) {
  const m = /^(\d+):(\d{2})(?:\.(\d{1,3}))?$/.exec(String(s).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0);
}

/** WCL 表格里 DoT 名称会带时长后缀（"Vampiric Touch 1.17 sec"），统一去掉 */
function normalizeAbility(name) {
  return String(name)
    .replace(/\s+[\d.]+\s*sec\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
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

const files = globSync(GLOB);
if (!files.length) {
  console.error(`没有匹配到文件：${GLOB}`);
  process.exit(2);
}

const events = [];
const perFile = [];
for (const f of files) {
  const rows = parseCsv(readFileSync(f, 'utf8'));
  if (!rows.length) continue;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const iTime = head.indexOf('time');
  const iType = head.indexOf('type');
  const iAbility = head.indexOf('ability');
  const iPair = head.findIndex((h) => h.includes('source'));
  if (iTime < 0 || iAbility < 0) {
    console.error(`${basename(f)} 不是事件表格式（缺 Time / Ability 列）`);
    process.exit(2);
  }
  let n = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const r of rows.slice(1)) {
    const t = parseClock(r[iTime]);
    if (t == null) continue;
    const pair = iPair >= 0 ? String(r[iPair]) : '';
    const [src, tgt] = pair.split('→').map((s) => s.trim());
    if (SOURCE && src !== SOURCE) continue;
    events.push({
      t,
      type: (iType >= 0 ? String(r[iType]).trim().toLowerCase() : 'cast') || 'cast',
      ability: normalizeAbility(r[iAbility]),
      target: tgt || null,
      file: basename(f),
    });
    n++;
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  perFile.push({ file: basename(f), events: n, from: tMin, to: tMax });
}

events.sort((a, b) => a.t - b.t);
// 分页导出的边界可能重复同一事件：按 (时间, 技能, 类型) 去重
const seen = new Set();
const deduped = [];
for (const e of events) {
  const k = `${e.t}|${e.ability}|${e.type}`;
  if (seen.has(k)) continue;
  seen.add(k);
  deduped.push(e);
}
const dupes = events.length - deduped.length;
events.length = 0;
events.push(...deduped);
if (dupes) console.log(`去重：跳过 ${dupes} 条重复事件`);
if (!events.length) {
  console.error('过滤后没有事件，检查 --source 是否与表里的名字一致');
  process.exit(2);
}

const t0 = events[0].t;
const casts = events
  .filter((e) => e.type === 'cast')
  .map((e) => ({ t: Math.round((e.t - t0) * 100) / 100, name: e.ability, target: e.target }));
const begins = events.filter((e) => e.type.includes('begin'));

const dur = Math.round((events[events.length - 1].t - t0) * 100) / 100;
const gaps = casts.slice(1).map((c, i) => Math.round((c.t - casts[i].t) * 100) / 100);

/**
 * 脱战切段：间隔 > PULL_GAP 秒视为新的一波/一场。
 * 这份导出没有战斗开始/结束事件，只能用间隔切——所以要在页面上写明"按间隔切段"。
 */
const PULL_GAP = 12;
const pulls = [];
let cur = [casts[0]];
for (let i = 1; i < casts.length; i++) {
  if (casts[i].t - casts[i - 1].t > PULL_GAP) {
    pulls.push(cur);
    cur = [casts[i]];
  } else {
    cur.push(casts[i]);
  }
}
pulls.push(cur);

const pullStats = pulls
  .map((list, idx) => {
    const start = list[0].t;
    const end = list[list.length - 1].t;
    const span = Math.max(1, end - start);
    const g = list.slice(1).map((c, i) => Math.round((c.t - list[i].t) * 100) / 100);
    // 单次 GCD 上限约 1.6 秒（急速满时约 0.75 秒），只统计这个区间内的间隔
    const gcdish = g.filter((x) => x >= 0.4 && x <= 1.7).sort((a, b) => a - b);
    const idleG = g.filter((x) => x > 1.8);
    const cnt = {};
    for (const c of list) cnt[c.name] = (cnt[c.name] ?? 0) + 1;
    return {
      index: idx + 1,
      start: Math.round(start * 10) / 10,
      end: Math.round(end * 10) / 10,
      spanSec: Math.round(span * 10) / 10,
      casts: list.length,
      castsPerMinute: Math.round((list.length / span) * 60 * 10) / 10,
      activeTime: Math.round((1 - idleG.reduce((a, b) => a + b, 0) / span) * 1000) / 10,
      gcdMedian: gcdish.length ? gcdish[Math.floor(gcdish.length / 2)] : null,
      idleCount: idleG.length,
      idleSec: Math.round(idleG.reduce((a, b) => a + b, 0) * 10) / 10,
      idleMax: idleG.length ? Math.max(...idleG) : 0,
      topAbilities: Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8),
      opener: list.slice(0, 16).map((c) => ({ t: Math.round((c.t - start) * 100) / 100, name: c.name })),
    };
  })
  .filter((p) => p.casts >= 8);

/** 爆发窗口：Voidform 施放后约 35 秒（用真实序列里窗口内的动作填充，不假设时长精度） */
const VF_WINDOW = 35;
const vfCasts = casts.filter((c) => c.name === 'Voidform').map((c) => c.t);
const burstWindows = vfCasts.map((t, i) => {
  const next = vfCasts[i + 1] ?? Infinity;
  const end = Math.min(t + VF_WINDOW, next);
  const acts = casts.filter((c) => c.t >= t && c.t < end);
  const cnt = {};
  for (const a of acts) cnt[a.name] = (cnt[a.name] ?? 0) + 1;
  return {
    index: i + 1,
    start: Math.round(t * 10) / 10,
    end: Math.round(end * 10) / 10,
    casts: acts.length,
    castsPerMinute: Math.round((acts.length / Math.max(1, end - t)) * 60 * 10) / 10,
    top: Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6),
    sequence: acts.map((a) => ({ t: Math.round((a.t - t) * 100) / 100, name: a.name })),
  };
});

const inCombatCasts = pullStats.reduce((a, p) => a + p.casts, 0);
const inCombatSpan = pullStats.reduce((a, p) => a + p.spanSec, 0);
const sortedGaps = [...gaps].sort((a, b) => a - b);
const median = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : null;
const idle = gaps.filter((g) => g > 1.8);
const counts = {};
for (const c of casts) counts[c.name] = (counts[c.name] ?? 0) + 1;

/** 某个技能两次施放之间的间隔（只在同一段内统计，避免跨脱战） */
function intervalStats(name) {
  const ts = [];
  for (const p of pulls) for (const c of p) if (c.name === name) ts.push(c.t);
  if (ts.length < 2) return null;
  const d = ts.slice(1).map((t, i) => Math.round((t - ts[i]) * 10) / 10);
  const s = [...d].sort((a, b) => a - b);
  return {
    count: ts.length,
    medianSec: s[Math.floor(s.length / 2)],
    minSec: s[0],
    maxSec: s[s.length - 1],
    intervals: d.slice(0, 40),
  };
}

mkdirSync(OUT_DIR, { recursive: true });
const rec = {
  runId: OUT,
  layer: 'L',
  source: 'wcl_table_csv',
  label: LABEL,
  sourceNote: 'WCL 事件表导出（Time/Type/Ability/Source→Target），无凭据离线导入',
  importedAt: new Date().toISOString(),
  files: perFile,
  durationSec: dur,
  counts: {
    casts: casts.length,
    beginCasts: begins.length,
    distinctAbilities: Object.keys(counts).length,
    topCasts: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15),
  },
  segmentNote: `脱战切段：间隔 > ${PULL_GAP} 秒视为新的一段（这份导出没有战斗开始/结束事件）`,
  metrics: {
    // 全程口径（含脱战）只作参考，真正看 pullStats
    wholeSpanSec: dur,
    wholeCastsPerMinute: dur ? Math.round((casts.length / dur) * 60 * 10) / 10 : null,
    gcdMedianAll: median,
    // 战斗内口径
    pulls: pullStats.length,
    inCombatCasts,
    inCombatSpanSec: Math.round(inCombatSpan * 10) / 10,
    inCombatCastsPerMinute: inCombatSpan ? Math.round((inCombatCasts / inCombatSpan) * 60 * 10) / 10 : null,
    inCombatActiveTime: inCombatSpan
      ? Math.round((1 - pullStats.reduce((a, p) => a + p.idleSec, 0) / inCombatSpan) * 1000) / 10
      : null,
    inCombatIdleSec: Math.round(pullStats.reduce((a, p) => a + p.idleSec, 0) * 10) / 10,
  },
  pullStats,
  burstWindows,
  cooldowns: Object.fromEntries(
    ['Voidform', 'Void Volley', 'Tentacle Slam', 'Vampiric Touch', 'Shadow Word: Pain', 'Power Infusion']
      .map((n) => [n, intervalStats(n)])
      .filter(([, v]) => v),
  ),
  opener: casts.slice(0, 30),
  series: casts.map((c) => ({ t: c.t, name: c.name, insanity: null, max: null, vf: false, target: c.target })),
  gaps,
};
writeFileSync(join(OUT_DIR, `${OUT}.json`), JSON.stringify(rec, null, 2) + '\n');
console.log(`写出 content/logs/${OUT}.json`);
console.log(`  ${LABEL}`);
console.log(`  全程 ${casts.length} 次施法 / ${dur}s · 脱战段 ${pullStats.length} 个 · Voidform 窗口 ${burstWindows.length} 个`);
console.log(`  战斗内 ${inCombatSpan.toFixed(0)}s / ${inCombatCasts} 次 = ${rec.metrics.inCombatCastsPerMinute} 次/分 · 活跃施法 ${rec.metrics.inCombatActiveTime}% · 空档合计 ${rec.metrics.inCombatIdleSec}s`);
for (const b of burstWindows.slice(0, 3)) {
  console.log(`   爆发窗口 ${b.index}: ${b.start}–${b.end}s · ${b.casts} 次（${b.castsPerMinute}/分）· 前 8 动作 ` +
    b.sequence.slice(0, 8).map((a) => a.name).join(' → '));
}
console.log('  前 12 个动作：' + casts.slice(0, 12).map((c) => `${c.t}s ${c.name}`).join(' → '));
for (const [n, s] of Object.entries(rec.cooldowns)) {
  console.log(`  ${n}: ${s.count} 次 · 间隔中位 ${s.medianSec}s（${s.minSec}–${s.maxSec}）`);
}
