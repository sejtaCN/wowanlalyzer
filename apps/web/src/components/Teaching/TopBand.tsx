import React from 'react';
import type { Chapter } from '@learn';
import { burstPairs, chapterRoute, getRun, type RouteDoc } from '../../data/content';
import { burstValueFor, chapterDecision } from './rules';

/** 顶图带：当前场景、可核对的差值、主行动。三格都读取同一份规则与配对结果。 */

/** 第一格的小图：整条路线的每一波，本档高亮 */
function MiniRoute({ route, range, selectedPull }: { route: RouteDoc | null; range: [number, number] | null; selectedPull?: number }) {
  if (!route) return null;
  const waves = route.waves;
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
  const isRoute = chapter.level === 'L2';
  const route = chapterRoute(chapter);
  const routeWave = isRoute && route ? route.waves.find((w) => w.pull === selectedPull) : null;
  const { modelKind, range, advice } = chapterDecision(chapter, routeWave);
  const pairs = chapter.chart.kind === 'burst-bars' ? burstPairs(chapter.chart.runIds ?? []) : [];
  const routeValue = routeWave ? burstValueFor(routeWave, getRun) : null;
  const routeOn = routeValue?.on ?? null;
  const routeOff = routeValue?.off ?? null;
  const top = pairs[0];
  const deltaPct = routeValue?.deltaPct ?? top?.deltaPct ?? null;
  const deltaDamage = routeValue?.deltaDamage ?? top?.deltaDamage ?? null;
  const ciPct = routeValue?.ciPct ?? top?.ciPct ?? null;
  const samples = routeOn?.samples ?? top?.on.samples ?? null;
  const routeType = routeWave
    ? routeWave.mobCount <= 0 ? '空波次' : routeWave.isBoss ? 'BOSS' : routeWave.mobCount >= 10 ? '大波' : routeWave.mobCount >= 5 ? '中波' : '小波'
    : null;
  const routeUnavailable = routeValue?.reason === 'empty'
    ? '这一波次 没有怪，不出差值结论'
    : routeValue?.reason === 'mixed-boss'
      ? 'BOSS 混小怪，不套普通木桩差值'
      : '配对或 CI 不完整，不出差值结论';

  return (
    <div className="topband reader-topband">
      <div className="tb-cell reader-situation">
        <div className="tb-k">{isRoute ? '当前选中的波' : '这一波长什么样'}</div>
        <MiniRoute route={route} range={range} selectedPull={isRoute ? routeWave?.pull : undefined} />
        <div className="tb-v">
          {routeWave ? `第 ${routeWave.pull} 波 · ${routeWave.mobCount} 只 · ${routeType}` : chapter.model ? `${chapter.model.targets} 只` : '全局规则，不绑定波次'}
        </div>
        <div className="tb-sub">
          {routeWave && route ? `整条路线 ${route.pulls} 波 / ${route.totalMobs} 只` : chapter.model?.frequency ? `路线频次 ${chapter.model.frequency}` : 'L0 讲的是所有波次共用的判断'}
        </div>
      </div>

      <div className="tb-cell reader-value">
        <div className="tb-k">一条数字结论</div>
        <div className="tb-big">
          {deltaPct != null ? `+${deltaPct.toFixed(1)}%` : routeWave ? '—' : chapter.model?.frequency ?? '—'}
        </div>
        {(routeOn && routeOff) || top ? (
          <div className="tb-pair" aria-hidden>
            <i className="on" style={{ width: `${((routeOn?.dps ?? top?.on.dps ?? 0) / Math.max(routeOn?.dps ?? top?.on.dps ?? 0, routeOff?.dps ?? top?.off.dps ?? 0, 1)) * 100}%` }} />
            <i className="off" style={{ width: `${((routeOff?.dps ?? top?.off.dps ?? 0) / Math.max(routeOn?.dps ?? top?.on.dps ?? 0, routeOff?.dps ?? top?.off.dps ?? 0, 1)) * 100}%` }} />
          </div>
        ) : null}
        <div className="tb-v">
          {deltaDamage != null
            ? `一次爆发 +${(deltaDamage / 1e6).toFixed(1)}M`
            : routeWave
              ? routeUnavailable
              : !top && pairs.length === 0 && chapter.chart.kind === 'burst-bars'
                ? '这组记录配不成对'
                : '本章结论见正文'}
        </div>
        <div className="tb-sub">
          {ciPct != null
            ? routeValue?.approximation
              ? `近似 · 按 ${routeValue.approximation.simulatedTargets} 目标档 · 保守误差上限 ±${ciPct.toFixed(2)}% · n=${samples ?? '—'}`
              : `保守误差上限 ±${ciPct.toFixed(2)}% · n=${samples ?? '—'}`
            : routeWave ? routeUnavailable : '来源：路线数据 / 优先级表'}
        </div>
      </div>

      <div className="tb-cell reader-action">
        <div className="tb-k">该做什么</div>
        {advice ? (
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
          <div className="figempty" data-figure-kind="missing">这一章没有波次模型：L0 不画波次图。</div>
        )}
      </div>
    </div>
  );
}
