/**
 * 两波间隔：把「这一波开还是下一波开」压成一个可核对的阈值。
 *
 * 输入全部是已有 runId / 日志：
 *   - 300s 单体与 3 目标动作序列里相邻虚空形态的起点间隔 → 观测冷却
 *   - 8 目标 / 2 目标 30s 的爆发 A/B → 两档收益
 *   - 小花生日志的 11 个虚空形态窗口 → 他的爆发节奏
 *
 * 这不是两波连打的模拟，只是把三个实测数组装到同一条时间轴上；
 * 页面必须标「算术推断」，不能写成像跑过一场两波战斗。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMS = join(ROOT, 'content', 'sims');
const LOGS = join(ROOT, 'content', 'logs');
const OUT = join(ROOT, 'content', 'analysis', 'cooldown-window-archon.json');

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

function cdsFromTrace(file) {
  const d = read(join(SIMS, file));
  const seq = d.actions?.series ?? [];
  const casts = seq.filter((a) => a.name === 'voidform').map((a) => a.t);
  assert(casts.length >= 2, `${file} 里虚空形态少于 2 次，不能取相邻间隔`);
  const gaps = casts.slice(1).map((t, i) => t - casts[i]).filter((g) => g > 30);
  assert(gaps.length >= 1, `${file} 没有有效冷却间隔`);
  return { runId: d.runId, casts, gaps: gaps.map((g) => round(g)) };
}

function burstPair(target) {
  const on = read(join(SIMS, `dec_voidform_on_1__w30_${target}__5000.json`));
  const off = read(join(SIMS, `dec_voidform_on_0__w30_${target}__5000.json`));
  const delta = (on.dps.mean - off.dps.mean) * on.durationSec;
  assert(delta > 0, `w30_${target} 的爆发增量不是正数`);
  return {
    targets: target,
    runIds: [off.runId, on.runId],
    onDps: on.dps.mean,
    offDps: off.dps.mean,
    deltaDamage: round(delta),
    deltaPct: round((on.dps.mean / off.dps.mean - 1) * 100),
  };
}

const st = cdsFromTrace('archon__st__5000.json');
const t3 = cdsFromTrace('archon__t3__5000.json');
const cds = [...st.gaps, ...t3.gaps];
const coldownMedian = median(cds);
const coldownMax = Math.max(...cds);

const log = read(join(LOGS, 'xiaohuasheng-events.json'));
const seg = log.segments[0];
const windows = seg.burstWindows.filter((w) => w.buff === 'Voidform').sort((a, b) => a.start - b.start);
const logGaps = windows.slice(1).map((w, i) => round(w.start - windows[i].start));
const logMedian = median(logGaps);
assert(logGaps.length >= 5, '日志爆发窗口太少，不能取间隔中位');
assert(logMedian > coldownMax, `日志爆发间隔中位 ${logMedian} 不超过观测冷却上限 ${coldownMax}，本页结论需重写`);

const big = burstPair(8);
const small = burstPair(2);

const doc = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  hero: 'archon',
  level: 'C',
  cooldown: {
    observedMedianSec: round(coldownMedian),
    observedMaxSec: round(coldownMax),
    samples: cds,
    sourceRuns: [st.runId, t3.runId],
    note: '相邻两次虚空形态施法起点的间隔；是动作序列观测值，不是技能说明里的理论冷却。',
  },
  log: {
    runId: log.runId,
    windows: windows.length,
    gaps: logGaps,
    medianSec: round(logMedian),
    minSec: round(Math.min(...logGaps)),
    maxSec: round(Math.max(...logGaps)),
    note: '11 个虚空形态窗口的起点间隔；不是任意两波的间隔。',
  },
  returns: {
    big: { targets: big.targets, deltaDamage: big.deltaDamage, deltaPct: big.deltaPct, runIds: big.runIds },
    small: { targets: small.targets, deltaDamage: small.deltaDamage, deltaPct: small.deltaPct, runIds: small.runIds },
    sourceRuns: [...big.runIds, ...small.runIds],
  },
  decision: {
    rule: '两波间隔 < 观测冷却上限时，只有一波能吃到爆发，给收益更大的大波；≥ 该间隔时两波都能开，不需要二选一。',
    observedCadenceExceedsCooldown: true,
    interpretation:
      '155.7 秒是爆发节奏，不是具体两波间隔；不能拿它给某一次小波贴「冷却没好」的标签。具体两波间隔需要 Fights 或 UNIT_DIED。',
  },
  method:
    '算术推断（C 层）：冷却阈值取 300 秒单体/3 目标动作序列里相邻虚空形态起点的最大间隔；收益取 8 目标与 2 目标 30 秒 A/B 的绝对增量；日志只提供他的爆发节奏。没有跑「两波连续战斗」的配对模拟。',
  limitation:
    '冷却会受天赋/触发影响；这里用的是本 profile 的观测值。日志阶段没有死亡事件，不能把 155.7 秒当成具体两波的间隔，只能当爆发节奏。',
};

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`写出 ${OUT}`);
console.log(`观测冷却 ${doc.cooldown.observedMedianSec}–${doc.cooldown.observedMaxSec}s（${cds.length} 个间隔）`);
console.log(`日志爆发间隔中位 ${doc.log.medianSec}s（${Math.min(...logGaps)}–${Math.max(...logGaps)}）`);
console.log(`大波 ${big.deltaDamage / 1e6}M / 小波 ${small.deltaDamage / 1e6}M`);
