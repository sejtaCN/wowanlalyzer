/**
 * 从 WCL 事件表推断"阶段"（不是单波）。
 *
 * 为什么只到阶段级：
 *   这份导出只有 施法/增益/减益，没有死亡事件；怪物名后缀编号会被复用；
 *   整场带目标施法间隔中位 1.27s，全程没有一次"空场"。所以单波边界不可靠，
 *   任何"第 N 波"的切法都是猜。阶段（副本分区 + 两个 BOSS）是可验证的。
 *
 * 方法：
 *   1. 敌人族按 30 秒窗口共现聚类 → 4 个区域族团 + 2 个 BOSS 族；
 *   2. 5 秒桶内按族团事件数投票，得到"主导区域"；
 *   3. 连续同主导的桶合并成阶段，短于 15 秒的并入相邻；
 *   4. BOSS 族出现的时间段单独切成 BOSS 阶段；
 *   5. 每阶段统计：时长、族、施法数、每分钟施法、爆发次数、爆发覆盖秒数。
 *
 * 用法：node scripts/infer-phases.mjs [--out content/logs/xiaohuasheng-phases.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (p) => join(ROOT, p);

const BUCKET = 5;      // 秒
const MIN_PHASE = 30;  // 秒
const CO_WINDOW = 15;  // 秒，共现窗口半宽

const PLAYERS = new Set(['小花生', '别回收我装备', '复制体丶张杰']);
const family = (t) => t.trim().replace(/\s*\d+$/, '');

/** 族团：由 30 秒窗口共现计数得到（见 docs 里的推断说明） */
const COHORTS = {
  入口祭坛: ['Ritual Chieftain', 'Primal Serpent', 'Twinfang Harrower', 'Ravenous Descendant', 'Venom Leech'],
  深处: ['Rattling Writhe', 'High Evolutionist', 'Bloodletter', 'Hatchling'],
  盘绕回廊: ['The Writhing Coil', 'Uncoiled Writhe'],
  上层平台: ["Blade of the Altar", "Ula'tek's Chosen", 'Ascendant Serpent'],
};
const BOSSES = { "Rav'i": 'BOSS 1 · Rav’i', "Zul'jan": 'BOSS 2 · Zul’jan' };
const cohortOf = new Map();
for (const [name, fams] of Object.entries(COHORTS)) for (const f of fams) cohortOf.set(f, name);

const logPath = SRC('content/logs/xiaohuasheng-events.json');
const log = JSON.parse(readFileSync(logPath, 'utf8'));
const seg = log.segments[0];

const events = seg.series
  .filter((e) => e.target && !PLAYERS.has(family(e.target)))
  .map((e) => ({ t: e.t, fam: family(e.target), full: e.target, ability: e.name }))
  .sort((a, b) => a.t - b.t);

const t0 = events[0].t;
const t1 = events[events.length - 1].t;
const nBuckets = Math.ceil((t1 - t0) / BUCKET) + 1;

/** 每个桶按族团投票 */
const votes = Array.from({ length: nBuckets }, () => ({}));
const bossesInBucket = Array.from({ length: nBuckets }, () => new Set());
for (const e of events) {
  const bi = Math.floor((e.t - t0) / BUCKET);
  if (BOSSES[e.fam]) bossesInBucket[bi].add(e.fam);
  const c = cohortOf.get(e.fam);
  if (c) votes[bi][c] = (votes[bi][c] ?? 0) + 1;
}

/** 主导族团（无投票则沿用上一桶） */
const dominant = [];
let last = null;
for (let i = 0; i < nBuckets; i++) {
  const v = votes[i];
  const best = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
  const d = best ? best[0] : last;
  dominant.push(d);
  if (d) last = d;
}

/** 3 桶中值滤波：抑制 A→B→A 抖动 */
const smooth = dominant.map((d, i) => {
  const win = [dominant[i - 1], d, dominant[i + 1]].filter(Boolean);
  const count = {};
  for (const x of win) count[x] = (count[x] ?? 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
});
dominant.length = 0;
dominant.push(...smooth);

/** 合并连续同主导 → 阶段 */
const phases = [];
let curStart = 0;
for (let i = 1; i <= nBuckets; i++) {
  if (i === nBuckets || dominant[i] !== dominant[curStart]) {
    phases.push({ cohort: dominant[curStart] ?? '未分类', from: curStart * BUCKET + t0, to: i * BUCKET + t0 });
    curStart = i;
  }
}
/** 短阶段并入前一阶段 */
const merged = [];
for (const p of phases) {
  const prev = merged[merged.length - 1];
  if (prev && (p.to - p.from < MIN_PHASE || prev.cohort === p.cohort)) prev.to = p.to;
  else merged.push({ ...p });
}

/** A-B-A 合并：中间段很短且两侧同族团时并回 */
for (let i = 1; i < merged.length - 1; i++) {
  const prev = merged[i - 1], mid = merged[i], next = merged[i + 1];
  if (prev.cohort === next.cohort && mid.to - mid.from <= 90) {
    prev.to = mid.to;
    merged.splice(i, 1);
    i -= 1;
  }
}

/** BOSS 段单独切：把含 BOSS 桶的区间独立出来 */
const bossRanges = [];
for (let i = 0; i < nBuckets; i++) {
  if (!bossesInBucket[i].size) continue;
  const fam = [...bossesInBucket[i]][0];
  const from = i * BUCKET + t0;
  const lastRange = bossRanges[bossRanges.length - 1];
  if (lastRange && lastRange.fam === fam && from - lastRange.to <= BUCKET * 3) lastRange.to = (i + 1) * BUCKET + t0;
  else bossRanges.push({ fam, from, to: (i + 1) * BUCKET + t0 });
}

/** 合成最终阶段表：BOSS 段优先于区域段 */
const all = [
  ...merged.map((p) => ({ kind: 'area', label: p.cohort, from: Math.round(p.from), to: Math.round(p.to) })),
  ...bossRanges.map((b) => ({ kind: 'boss', label: BOSSES[b.fam], from: Math.round(b.from), to: Math.round(b.to), fam: b.fam })),
].sort((a, b) => a.from - b.from);

/** 同区重叠时把区域段裁掉 BOSS 部分 */
const timeline = [];
for (const p of all) {
  const prev = timeline[timeline.length - 1];
  if (prev && p.from < prev.to) {
    if (p.kind === 'boss') {
      prev.to = p.from;
      timeline.push(p);
    } else {
      // 区域段从 BOSS 结束处开始
      timeline.push({ ...p, from: prev.to });
    }
  } else timeline.push(p);
}
const final = timeline.filter((p) => p.to - p.from >= MIN_PHASE / 2);

/** 每阶段指标 */
const burstWindows = seg.burstWindows.filter((w) => w.buff === 'Voidform');
const outPhases = final.map((p, i) => {
  const inside = events.filter((e) => e.t >= p.from && e.t <= p.to);
  const fams = {};
  for (const e of inside) fams[e.fam] = (fams[e.fam] ?? 0) + 1;
  const dur = p.to - p.from;
  const allCasts = seg.series.filter((e) => e.t >= p.from && e.t <= p.to);
  const bursts = burstWindows.filter((w) => w.start >= p.from && w.start <= p.to);
  const burstSec = burstWindows.reduce(
    (n, w) => n + Math.max(0, Math.min(w.end, p.to) - Math.max(w.start, p.from)),
    0,
  );
  return {
    index: i + 1,
    kind: p.kind,
    label: p.label,
    from: p.from,
    to: p.to,
    durationSec: dur,
    families: Object.entries(fams).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    enemyCasts: inside.length,
    allCasts: allCasts.length,
    castsPerMinute: Number(((allCasts.length / Math.max(1, dur)) * 60).toFixed(1)),
    bursts: bursts.length,
    burstUptimeSec: Number(burstSec.toFixed(1)),
  };
});

/* ---------- 与 keystone 路线波次做家族匹配 ---------- */
const routePath = SRC('content/routes/waves-altar-of-fangs.json');
let routeMatches = {};
try {
  const route = JSON.parse(readFileSync(routePath, 'utf8'));
  const routeWaves = route.waves.map((w) => ({
    pull: w.pull,
    mobs: w.mobCount,
    isBoss: w.isBoss,
    fams: new Set(w.mobs.map((m) => family(m.name))),
  }));
  for (const p of outPhases) {
    const fams = new Set(p.families.map((f) => f.name));
    const scored = routeWaves
      .map((w) => {
        const inter = [...fams].filter((f) => w.fams.has(f)).length;
        const union = new Set([...fams, ...w.fams]).size || 1;
        return { pull: w.pull, mobs: w.mobs, isBoss: w.isBoss, jaccard: Number((inter / union).toFixed(2)) };
      })
      .filter((w) => w.jaccard > 0)
      .sort((a, b) => b.jaccard - a.jaccard)
      .slice(0, 3);
    routeMatches[p.index] = scored;
  }
} catch {
  routeMatches = {};
}

const doc = {
  runId: 'xiaohuasheng-phases',
  sourceLog: log.runId,
  label: log.label,
  method: {
    summary: '按怪物族共现分区域 + BOSS 族单独成段；5 秒桶投票，短于 15 秒的段并入相邻',
    bucketSec: BUCKET,
    minPhaseSec: MIN_PHASE,
    coWindowSec: CO_WINDOW,
    cohorts: COHORTS,
  },
  limitation:
    '只有施法/增益/减益，没有死亡事件；怪物名后缀编号会被复用；全程无空场。' +
    '所以这是阶段级推断，不是单波；要做单波需要带 Fights 或 UNIT_DIED 的导出。',
  totalSec: Number((t1 - t0).toFixed(1)),
  phases: outPhases,
  routeMatches,
  routeSource: 'content/routes/waves-altar-of-fangs.json',
  generatedAt: new Date().toISOString(),
};

const argOut = process.argv.indexOf('--out');
const outPath = argOut > -1 ? resolve(process.argv[argOut + 1]) : SRC('content/logs/xiaohuasheng-phases.json');
writeFileSync(outPath, JSON.stringify(doc, null, 1), 'utf8');

console.log(`阶段 ${outPhases.length} 段 / 总时长 ${doc.totalSec}s`);
for (const p of outPhases) {
  const f = p.families.slice(0, 3).map((x) => x.name).join(', ');
  console.log(
    `  ${String(p.index).padStart(2)} ${String(Math.round(p.from)).padStart(5)}–${String(Math.round(p.to)).padStart(5)}s ` +
      `(${String(p.durationSec).padStart(4)}s) ${p.kind === 'boss' ? '★' : ' '} ${p.label.padEnd(14)} ` +
      `爆发 ${p.bursts} 次 · ${p.castsPerMinute}/分 · ${f} · 匹配 ${(routeMatches[p.index] ?? []).map((m) => '#' + m.pull + '(' + m.jaccard + ')').join(' ') || '—'}`,
  );
}
console.log(`写出 ${outPath}`);
