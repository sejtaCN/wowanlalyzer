import React from 'react';
import type { RouteDoc, RouteWave } from '../../data/content';
import { getRun } from '../../data/content';
import { burstAdvice, burstValueFor } from './rules';

const TYPE = (w: RouteWave) => (w.mobCount <= 0 ? '空波次' : w.isBoss ? 'BOSS' : w.mobCount >= 10 ? '大波' : w.mobCount >= 5 ? '中波' : '小波');

/** 路线总览：真实波次，柱高 = 怪数，色 = 建议；点柱切当前波，不标地图坐标。 */
export function RouteExplorer({
  route,
  selectedPull,
  onSelect,
}: {
  route: RouteDoc;
  selectedPull: number;
  onSelect: (pull: number) => void;
}) {
  const waves = route.waves;
  const max = Math.max(...waves.map((w) => w.mobCount));
  return (
    <div className="route-explorer" data-figure-kind="route-strip">
      <div className="route-strip" role="group" aria-label={`${route.pulls} 波，选择一波查看`}>
        {waves.map((w) => {
          const adv = burstAdvice(w);
          const active = w.pull === selectedPull;
          return (
            <button
              key={w.pull}
              type="button"
              className={`route-wave ${adv.tone}${active ? ' on' : ''}${w.isBoss ? ' boss' : ''}`}
              onClick={() => onSelect(w.pull)}
              aria-pressed={active}
              title={`第 ${w.pull} 波：${w.mobCount} 只，${adv.text}`}
            >
              <span className="route-bar" style={{ height: `${Math.max(8, (w.mobCount / max) * 82)}%` }}>
                <i>{w.mobCount}</i>
              </span>
              <small>{w.pull}</small>
            </button>
          );
        })}
      </div>
      <div className="route-meta">
        <span><i className="pm-key add" />开</span>
        <span><i className="pm-key maybe" />看冷却</span>
        <span><i className="pm-key no" />不开</span>
        <span>{route.dungeon} · {route.pulls} 波 · {route.totalMobs} 只 · 点柱切换</span>
      </div>
    </div>
  );
}

/** 当前波的细节：组成与合法配对共用同一取值结果；空波与混合 BOSS 不出差值。 */
export function SelectedWavePanel({ wave }: { wave: RouteWave }) {
  const value = burstValueFor(wave, getRun);
  const on = value.on;
  const off = value.off;
  const adv = burstAdvice(wave);
  const maxDps = Math.max(on?.dps ?? 0, off?.dps ?? 0) || 1;
  return (
    <div className="selected-wave" data-figure-kind="selected-wave" data-burst-reason={value.reason ?? 'paired'}>
      <div className="sw-top">
        <span className="sw-pull">第 {wave.pull} 波{wave.encounter ? ` · ${wave.encounter}` : ''}</span>
        <span className="sw-kind">{TYPE(wave)} · {wave.mobCount} 只</span>
        <span className={`adv ${adv.tone}`}>{adv.text}</span>
      </div>
      <div className="sw-mobs">
        {wave.mobs.map((m) => (
          <span className="sw-mob" key={m.name}>
            <b>{m.name}</b><small>×{m.count}</small>
          </span>
        ))}
      </div>
      {on && off && value.deltaDamage != null && value.deltaPct != null && value.ciPct != null ? (
        <>
          <div className="bars sw-bars">
            <div className="brow">
              <span className="tag on">开爆发</span>
              <span className="tr"><i className="on" style={{ width: `${(on.dps / maxDps) * 100}%` }} /></span>
              <span className="num">{Math.round(on.dps).toLocaleString()}</span>
            </div>
            <div className="brow">
              <span className="tag off">不开</span>
              <span className="tr"><i className="off" style={{ width: `${(off.dps / maxDps) * 100}%` }} /></span>
              <span className="num">{Math.round(off.dps).toLocaleString()}</span>
            </div>
          </div>
          <div className="sw-read">
            <span>差 <b>+{value.deltaPct.toFixed(1)}%</b></span>
            <span>一次多 <b>+{(value.deltaDamage / 1e6).toFixed(1)}M</b></span>
            <span>保守误差上限 ±{value.ciPct.toFixed(2)}% · n={on.samples ?? '—'}</span>
          </div>
          <details className="sw-raw">
            <summary>查看配对记录</summary>
            <div className="note">开：{value.onRunId}</div>
            <div className="note">不开：{value.offRunId}</div>
          </details>
          {value.approximation ? (
            <p className="sw-note">
              本波 {value.approximation.actualMobs} 只（含 {value.approximation.bossCount} 只 BOSS），木桩复原不了这个组合；
              差值按 {value.approximation.simulatedTargets} 目标档近似，只作方向参考。
            </p>
          ) : wave.mobCount > 8 ? <p className="sw-note">这一波 {wave.mobCount} 只，模拟按 8 只档计；数值是保守下限。</p> : null}
        </>
      ) : (
        <div className="figempty">
          {value.reason === 'empty'
            ? '这一波次 没有怪，不匹配模拟场景，也不显示爆发差值。'
            : value.reason === 'mixed-boss'
              ? 'BOSS 与小怪同波，现有单体或多目标木桩都不能代表这一组合；这里不显示差值。'
              : '配对元数据或 CI 不完整，不出差值结论。'}
        </div>
      )}
    </div>
  );
}
