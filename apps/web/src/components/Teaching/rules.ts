/**
 * 爆发判断的唯一入口：阈值、路线保护与配对都从这里走。
 * 所有增量由 runId 即时计算，不在代码里保存模拟结果。
 */
import { burstPairFromRuns, type RouteWave, type SimRun } from '../../data/content';

export function burstRunPair(scenarioId: string) {
  return {
    onRunId: `dec_voidform_on_1__${scenarioId}__5000`,
    offRunId: `dec_voidform_on_0__${scenarioId}__5000`,
  };
}

export type RouteBurstReason = 'empty' | 'mixed-boss' | 'no-scenario' | 'invalid-pair' | null;

/**
 * 路线波次的唯一取值入口。空 pull、无场景或配对 / CI 不合法时，
 * 顶部、当前波和示例图都得到同一个 null 差值，不回退到其他木桩档。
 * BOSS 混小怪只在没有近似档时拦截；有近似档则放行，并把 approximation 带回给页面标注。
 */
export function burstValueFor(
  wave: Pick<RouteWave, 'mobCount' | 'isBoss' | 'trashMobCount' | 'scenarioId' | 'approximation'>,
  readRun: (id: string) => SimRun | null,
) {
  const empty = wave.mobCount <= 0;
  const mixedBoss = wave.isBoss && (wave.trashMobCount ?? wave.mobCount) > 0;
  const approximation = mixedBoss ? wave.approximation ?? null : null;
  const approximated = approximation != null;
  const reason: RouteBurstReason = empty
    ? 'empty'
    : mixedBoss && !approximated
      ? 'mixed-boss'
      : !wave.scenarioId
        ? 'no-scenario'
        : null;
  const ids = wave.scenarioId && !reason ? burstRunPair(wave.scenarioId) : { onRunId: null, offRunId: null };
  const on = ids.onRunId ? readRun(ids.onRunId) : null;
  const off = ids.offRunId ? readRun(ids.offRunId) : null;
  const pair = on && off ? burstPairFromRuns(on, off) : null;
  return {
    ...ids,
    on: pair?.on ?? null,
    off: pair?.off ?? null,
    deltaDamage: pair?.deltaDamage ?? null,
    deltaPct: pair?.deltaPct ?? null,
    ciPct: pair?.ciPct ?? null,
    approximation: approximated ? approximation : null,
    reason: reason ?? (pair ? null : 'invalid-pair' as const),
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
  if (w.mobCount <= 0) return { text: '无怪', tone: 'no', why: '这一波次 没有怪，不做爆发判断' };
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

/** 页面主行动与 UI 门禁共用的同源判断，不再在门禁里冻结一份结论表。 */
export function chapterDecision(
  chapter: { model: { targets: string; kind?: string } | null },
  routeWave?: Pick<RouteWave, 'mobCount' | 'isBoss'> | null,
) {
  const modelKind = routeWave ? (routeWave.isBoss ? 'boss' : 'wave') : chapter.model?.kind ?? 'wave';
  const range = modelKind === 'rhythm'
    ? null
    : routeWave
      ? [routeWave.mobCount, routeWave.mobCount] as [number, number]
      : parseTargets(chapter.model?.targets ?? null);
  const advice = modelKind === 'rhythm'
    ? { text: '看间隔', tone: 'maybe' as const, why: '两波间隔 <122.4s 给大波；≥122.4s 两波都能开' }
    : modelKind === 'adds'
      ? { text: '开', tone: 'yes' as const, why: '加怪窗口看爆发放大倍数，不套普通目标数阈值' }
      : range
        ? burstAdvice({ mobCount: range[0], isBoss: modelKind === 'boss' })
        : null;
  return { modelKind, range, advice };
}
