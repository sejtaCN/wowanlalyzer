/**
 * 爆发判断的唯一入口：阈值写在这里；所有增量由 runId 即时计算。
 * 不在代码里保存模拟结果，避免换版本后图、表各写一套。
 */
export const BURST_TARGETS = [8, 7, 6, 5, 2] as const;

export function burstRunPair(targets: number, isBoss = false) {
  const scenario = isBoss ? 'w90_1b' : `w30_${BURST_TARGETS.find((n) => targets >= n) ?? 2}`;
  return {
    onRunId: `dec_voidform_on_1__${scenario}__5000`,
    offRunId: `dec_voidform_on_0__${scenario}__5000`,
  };
}

export function burstValueFor(
  targets: number,
  isBoss = false,
  readRun: (id: string) => { dps: number; durationSec: number | null; ci95Pct: number | null } | null,
) {
  const pair = burstRunPair(targets, isBoss);
  const on = readRun(pair.onRunId);
  const off = readRun(pair.offRunId);
  const duration = on?.durationSec ?? off?.durationSec;
  if (!on || !off || duration == null) {
    return { ...pair, deltaDamage: null, deltaPct: null, ciPct: null };
  }
  return {
    ...pair,
    deltaDamage: (on.dps - off.dps) * duration,
    deltaPct: ((on.dps - off.dps) / off.dps) * 100,
    ciPct: (on.ci95Pct ?? 0) + (off.ci95Pct ?? 0),
  };
}

export type BurstTone = 'yes' | 'maybe' | 'no';
export interface BurstAdvice {
  text: string;
  tone: BurstTone;
  /** 为什么这么判，一句话，可复核 */
  why: string;
}

/** 爆发建议：给谁、不给谁。规则写在页面上，用户可以自己复核 */
export function burstAdvice(w: { mobCount: number; isBoss: boolean }): BurstAdvice {
  if (w.isBoss) return { text: '看下一波', tone: 'maybe', why: '单体档增量低于大波；下一波更大就留，没有更大一波再开' };
  if (w.mobCount >= 7) return { text: '开', tone: 'yes', why: '≥7 只进入大波优先档' };
  if (w.mobCount >= 5) return { text: '看冷却', tone: 'maybe', why: '5–6 只留给更大的一波' };
  return { text: '不开', tone: 'no', why: '≤4 只，留给下一波更大的' };
}

/** 把章节里的 "10–22" / "3–5" / "单目标" 解析成 [下界, 上界] */
export function parseTargets(text: string | null | undefined): [number, number] | null {
  if (!text) return null;
  const m = text.match(/(\d+)\s*[–\-~到→]\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  const one = text.match(/(\d+)/);
  if (one) return [Number(one[1]), Number(one[1])];
  return null;
}
