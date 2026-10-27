/**
 * 把 content/sims/*.json 汇总成前端读的 numeric-summary.json。
 *
 * 为什么需要它：前端不逐个 import 上百个 JSON，只读这一张表；
 * 每次跑完新的模拟（sims-run / leverage / adds-run / decision-ab）都要重跑一次。
 *
 * 用法：node scripts/sims-summary.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMS = join(ROOT, 'content', 'sims');
const OUT = join(SIMS, 'numeric-summary.json');

const SKIP = new Set(['numeric-summary.json']);

const runs = {};
let skipped = 0;

for (const f of readdirSync(SIMS)) {
  if (!f.endsWith('.json') || SKIP.has(f)) continue;
  let d;
  try {
    d = JSON.parse(readFileSync(join(SIMS, f), 'utf8'));
  } catch {
    skipped += 1;
    continue;
  }
  if (!d || Array.isArray(d) || !d.runId || !d.dps?.mean) {
    skipped += 1;
    continue;
  }
  runs[d.runId] = {
    runId: d.runId,
    scenarioId: d.scenarioId ?? null,
    label: d.scenarioLabel ?? d.label ?? d.scenarioId ?? null,
    dps: Math.round(d.dps.mean),
    ci95Pct: d.dps.ci95Pct ?? null,
    samples: d.dps.samples ?? null,
    durationSec: d.durationSec ?? null,
    targets: d.targets ?? null,
    kind: d.kind ?? null,
    hero: d.hero ?? null,
    simc: { version: d.simc?.version ?? null, commit: d.simc?.gitRevision ?? d.simc?.commit ?? null },
  };
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 0) + '\n');

const byKind = {};
for (const r of Object.values(runs)) byKind[r.kind ?? 'unknown'] = (byKind[r.kind ?? 'unknown'] ?? 0) + 1;
console.log(`汇总 ${Object.keys(runs).length} 个 runId → content/sims/numeric-summary.json（跳过 ${skipped} 个非模拟文件）`);
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(18)} ${v}`);
