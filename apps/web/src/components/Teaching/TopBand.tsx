import React from 'react';
import type { Chapter } from '@learn';
import { ALTAR_WAVES, burstPairs, getRun } from '../../data/content';
import { useReaderRefresh } from '../../state/reader-refresh';
import { burstAdvice, burstValueFor, parseTargets } from './rules';
import DecisionFlow from './DecisionFlow';

/**
 * 顶图带：三格 = 这一波长什么样 / 一条数字结论 / 该做什么。
 *
 * 三格都从章节数据算：波次来自路线，数字来自 runId 配对，
 * 动作来自 rules.ts 的同一套阈值。缺数据的格子写"待补"，不写形容词。
 */

/** 第一格的小图：整条路线的每一波，本档高亮 */
function MiniRoute({ range, selectedPull }: { range: [number, number] | null; selectedPull?: number }) {
  const waves = ALTAR_WAVES.waves;
  const max = Math.max(...waves.map((w) => w.mobCount));
  return (
    <div className="tb-mini" aria-hidden>
      {waves.map((w) => {
        const inBand = !w.isBoss && range ? w.mobCount >= range[0] && w.mobCount <= range[1] : false;
        return (
          <i
            key={w.pull}
            className={`${inBand ? 'on' : ''}${w.isBoss ? ' boss' : ''}${w.pull === selectedPull ? ' sel' : ''}`}
            style={{ height: `${Math.max(6, (w.mobCount / max) * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

export default function TopBand({ chapter, selectedPull }: { chapter: Chapter; selectedPull?: number }) {
  const readerRefresh = useReaderRefresh();
  const isRoute = chapter.level === 'L2';
  const routeWave = isRoute ? ALTAR_WAVES.waves.find((w) => w.pull === selectedPull) : null;
  const modelKind = routeWave ? (routeWave.isBoss ? 'boss' : 'wave') : chapter.model?.kind ?? 'wave';
  const range = modelKind === 'rhythm' ? null : routeWave ? [routeWave.mobCount, routeWave.mobCount] as [number, number] : parseTargets(chapter.model?.targets ?? null);
  const pairs = chapter.chart.kind === 'burst-bars' ? burstPairs(chapter.chart.runIds ?? []) : [];
  const routeValue = routeWave ? burstValueFor(routeWave.mobCount, routeWave.isBoss, getRun) : null;
  const routeOn = routeValue ? getRun(routeValue.onRunId) : null;
  const routeOff = routeValue ? getRun(routeValue.offRunId) : null;
  const top = pairs[0];
  const deltaPct = routeValue?.deltaPct ?? top?.deltaPct ?? null;
  const deltaDamage = routeValue?.deltaDamage ?? top?.deltaDamage ?? null;
  const ciPct = routeValue?.ciPct ?? top?.ciPct ?? null;
  const samples = routeOn?.samples ?? top?.on.samples ?? null;
  const routeType = routeWave ? (routeWave.isBoss ? 'BOSS' : routeWave.mobCount >= 10 ? '大波' : routeWave.mobCount >= 5 ? '中波' : '小波') : null;
  const advice = modelKind === 'rhythm'
    ? {
        text: '看间隔',
        tone: 'maybe' as const,
        why: '两波间隔 <122.4s 给大波；≥122.4s 两波都能开',
      }
    : modelKind === 'adds'
      ? {
          text: '开',
          tone: 'yes' as const,
          why: '加怪窗口看爆发放大倍数，不套普通目标数阈值',
        }
      : range
        ? burstAdvice({ mobCount: range[0], isBoss: modelKind === 'boss' })
        : null;

  return (
    <div className={`topband${readerRefresh ? ' reader-topband' : ''}`}>
      <div className={`tb-cell${readerRefresh ? ' reader-situation' : ''}`}>
        <div className="tb-k">{isRoute ? '当前选中的波' : '这一波长什么样'}</div>
        <MiniRoute range={range} selectedPull={isRoute ? routeWave?.pull : undefined} />
        <div className="tb-v">
          {routeWave ? `第 ${routeWave.pull} 波 · ${routeWave.mobCount} 只 · ${routeType}` : chapter.model ? `${chapter.model.targets} 只` : '全局规则，不绑定波次'}
        </div>
        <div className="tb-sub">
          {routeWave ? `整条路线 ${ALTAR_WAVES.pulls} 波 / ${ALTAR_WAVES.totalMobs} 只` : chapter.model?.frequency ? `路线频次 ${chapter.model.frequency}` : 'L0 讲的是所有波次共用的判断'}
        </div>
      </div>

      <div className={`tb-cell${readerRefresh ? ' reader-value' : ''}`}>
        <div className="tb-k">一条数字结论</div>
        <div className="tb-big">
          {deltaPct != null ? `+${deltaPct.toFixed(1)}%` : chapter.model?.frequency ?? '—'}
        </div>
        {routeOn && routeOff || top ? (
          <div className="tb-pair" aria-hidden>
            <i className="on" style={{ width: `${((routeOn?.dps ?? top?.on.dps ?? 0) / Math.max(routeOn?.dps ?? top?.on.dps ?? 0, routeOff?.dps ?? top?.off.dps ?? 0, 1)) * 100}%` }} />
            <i className="off" style={{ width: `${((routeOff?.dps ?? top?.off.dps ?? 0) / Math.max(routeOn?.dps ?? top?.on.dps ?? 0, routeOff?.dps ?? top?.off.dps ?? 0, 1)) * 100}%` }} />
          </div>
        ) : null}
        <div className="tb-v">
          {deltaDamage != null ? `一次爆发 +${(deltaDamage / 1e6).toFixed(1)}M` : top === null && pairs.length === 0 && chapter.chart.kind === 'burst-bars' ? '这组 runId 配不成对' : '本章结论见正文'}
        </div>
        <div className="tb-sub">
          {ciPct != null ? `±${ciPct.toFixed(2)}% (95% CI, n=${samples ?? '—'})` : '来源：路线数据 / 优先级表'}
        </div>
      </div>

      <div className={`tb-cell${readerRefresh ? ' reader-action' : ''}`}>
        <div className="tb-k">该做什么</div>
        {readerRefresh && advice ? (
          <>
            <div className={`reader-verdict ${advice.tone}`}>{advice.text}</div>
            <div className="reader-verdict-why">{advice.why}</div>
            <div className="reader-decision-path">
              {routeWave ? routeWave.mobCount : chapter.model?.targets ?? '—'} 只
              {' › '}
              {routeWave ? 30 : chapter.model?.durationSec ?? '—'} 秒
              {' › '}
              {advice.text}
            </div>
          </>
        ) : (
          <DecisionFlow
            targets={routeWave ? String(routeWave.mobCount) : chapter.model?.targets ?? null}
            durationSec={routeWave ? 30 : chapter.model?.durationSec ?? null}
            isBoss={modelKind === 'boss'}
            isAdds={modelKind === 'adds'}
            isRhythm={modelKind === 'rhythm'}
            compact
          />
        )}
      </div>
    </div>
  );
}
