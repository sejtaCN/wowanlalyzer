import React from 'react';
import type { RouteWave } from '../../data/content';
import { ALTAR_WAVES, getRun } from '../../data/content';
import { burstAdvice, burstValueFor } from './rules';

const TYPE = (w: RouteWave) => (w.isBoss ? 'BOSS' : w.mobCount >= 10 ? '大波' : w.mobCount >= 5 ? '中波' : '小波');

/** 路线总览：真实 14 波，柱高 = 怪数，色 = 建议；点柱切当前波，不标地图坐标。 */
export function RouteExplorer({
  selectedPull,
  onSelect,
}: {
  selectedPull: number;
  onSelect: (pull: number) => void;
}) {
  const waves = ALTAR_WAVES.waves;
  const max = Math.max(...waves.map((w) => w.mobCount));
  return (
    <div className="route-explorer" data-figure-kind="route-strip">
      <div className="route-strip" role="group" aria-label="祭牙祭坛 14 波，选择一波查看">
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
        <span>{ALTAR_WAVES.pulls} 波 · {ALTAR_WAVES.totalMobs} 只 · 点柱切换</span>
      </div>
    </div>
  );
}

/** 当前波的细节：只显示组成、目标档与一次爆发的开/不开两行。 */
export function SelectedWavePanel({ wave }: { wave: RouteWave }) {
  const value = burstValueFor(wave.mobCount, wave.isBoss, getRun);
  const on = getRun(value.onRunId);
  const off = getRun(value.offRunId);
  const adv = burstAdvice(wave);
  const maxDps = Math.max(on?.dps ?? 0, off?.dps ?? 0) || 1;
  return (
    <div className="selected-wave" data-figure-kind="selected-wave">
      <div className="sw-top">
        <span className="sw-pull">第 {wave.pull} 波</span>
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
      {on && off && value.deltaDamage != null && value.deltaPct != null ? (
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
            <span>±{value.ciPct?.toFixed(2)}%（95% CI，n={on.samples ?? '—'}）</span>
            <span className="mono">开：{value.onRunId}</span>
            <span className="mono">不开：{value.offRunId}</span>
          </div>
          {wave.mobCount > 8 ? <p className="sw-note">这一波 {wave.mobCount} 只，模拟按 8 只档计；数值是保守下限。</p> : null}
        </>
      ) : (
        <div className="figempty">这一波的配对 runId 缺失，数值待补。</div>
      )}
    </div>
  );
}
