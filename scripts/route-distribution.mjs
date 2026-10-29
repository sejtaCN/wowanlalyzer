/**
 * 统计路线文件的波次类型分布（大波 / 中波 / 小波 / BOSS）。
 *
 * 分类口径取自 docs/curriculum.md §1：
 *   大波 = 目标数 ≥10 ｜ 中波 = 5–9 ｜ 小波 = ≤4 ｜ BOSS = 波内含首领（路线分类）
 * 空 pull（mobCount = 0）不计入分母，单独报数；BOSS 与小怪同波的单独列出。
 *
 * 数据从哪来、怎么重抓、怎么换副本，见 docs/research/route-data-pipeline.md。
 *
 * 用法：
 *   node scripts/route-distribution.mjs                 # 统计 content/routes/*.json
 *   node scripts/route-distribution.mjs a.json b.json   # 指定文件
 *   node scripts/route-distribution.mjs --json          # 机器可读输出
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE_DIR = join(ROOT, 'content', 'routes');
const LABEL = { large: '大波', mid: '中波', small: '小波', boss: 'BOSS' };

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const givenFiles = argv.filter((a) => !a.startsWith('--'));
const paths = givenFiles.length
  ? givenFiles.map((f) => resolve(ROOT, f))
  : readdirSync(ROUTE_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(ROUTE_DIR, f));

function classify(wave) {
  if (wave.isBoss) return 'boss';
  if (wave.mobCount >= 10) return 'large';
  if (wave.mobCount >= 5) return 'mid';
  return 'small';
}

function summarize(path) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const waves = doc.waves ?? [];
  const played = waves.filter((w) => w.mobCount > 0);
  const counts = { large: 0, mid: 0, small: 0, boss: 0 };
  const mixedBoss = [];
  for (const w of played) {
    counts[classify(w)] += 1;
    if (w.isBoss && w.trashMobCount > 0) mixedBoss.push({ pull: w.pull, mobs: w.mobCount, trash: w.trashMobCount });
  }
  let largeToSmall = 0;
  let smallToLarge = 0;
  for (let i = 1; i < played.length; i += 1) {
    const prev = classify(played[i - 1]);
    const cur = classify(played[i]);
    if (prev === 'large' && cur === 'small') largeToSmall += 1;
    if (prev === 'small' && cur === 'large') smallToLarge += 1;
  }
  return {
    file: basename(path),
    dungeon: doc.dungeon ?? null,
    route: doc.route ?? null,
    pulls: waves.length,
    played: played.length,
    emptyPulls: waves.length - played.length,
    counts,
    mixedBoss,
    largeToSmall,
    smallToLarge,
    sequence: played.map((w) => (w.isBoss ? 'B' : String(w.mobCount))),
  };
}

const routes = paths.map(summarize);

if (asJson) {
  const total = routes.reduce(
    (acc, r) => ({
      pulls: acc.pulls + r.played,
      counts: Object.fromEntries(Object.keys(acc.counts).map((k) => [k, acc.counts[k] + r.counts[k]])),
    }),
    { pulls: 0, counts: { large: 0, mid: 0, small: 0, boss: 0 } },
  );
  console.log(JSON.stringify({ routes, total }, null, 1));
} else {
  const total = { large: 0, mid: 0, small: 0, boss: 0 };
  let totalWaves = 0;
  for (const r of routes) {
    totalWaves += r.played;
    for (const k of Object.keys(total)) total[k] += r.counts[k];
    console.log(`${r.dungeon ?? r.file}：${r.pulls} pull / ${r.played} 非空（空 pull ${r.emptyPulls}）`);
    console.log(`  ${Object.keys(LABEL).map((k) => `${LABEL[k]} ${r.counts[k]}`).join(' · ')}`);
    console.log(`  逐波：${r.sequence.join(' ')}（B = BOSS）`);
    if (r.mixedBoss.length) {
      console.log(
        `  BOSS 带小怪 ${r.mixedBoss.length} 波：${r.mixedBoss
          .map((m) => `p${m.pull}（${m.mobs} 只，其中小怪 ${m.trash}）`)
          .join('、')} —— 木桩模型不适用，模拟需单独建模`,
      );
    }
    console.log(`  相邻序列 大→小 ${r.largeToSmall} 次 / 小→大 ${r.smallToLarge} 次`);
  }
  if (routes.length > 1) {
    console.log(`\n合计 ${totalWaves} 波：`);
    for (const k of Object.keys(LABEL)) {
      const pct = totalWaves ? Math.round((total[k] / totalWaves) * 1000) / 10 : 0;
      console.log(`  ${LABEL[k]} ${total[k]}（${pct}%）`);
    }
  }
}
