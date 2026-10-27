import React from 'react';
import type { WaveModelCard } from '@learn';
import { parseTargets } from './rules';

/**
 * 目标数刻度：把“这一波几只”画在完整分档上，阈值只出现一次。
 * 只使用章节模型卡里的目标范围；不是路线坐标，也不假装是实测存活时长。
 */
export default function TargetBand({ model }: { model: WaveModelCard }) {
  const range = parseTargets(model.targets);
  const lo = range ? Math.min(range[0], range[1]) : 1;
  const hi = range ? Math.max(range[0], range[1]) : 1;
  const bands = [
    { label: '小波', from: 1, to: 4 },
    { label: '中波', from: 5, to: 9 },
    { label: '大波', from: 10, to: 22 },
  ];
  const max = Math.max(22, hi);
  const x = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const ticks = [1, 5, 7, 10, max].filter((n, i, a) => a.indexOf(n) === i);
  const center = (lo + hi) / 2;
  const centerOnThreshold = Math.abs(center - 7) < 0.01;
  const centerLabel = lo === hi ? '当前目标数' : '本档中心';

  return (
    <div className="target-band" data-figure-kind="target-band">
      <div className="tb-track" role="img" aria-label={`目标数分档，本档 ${model.targets} 只`}>
        {bands.map((b) => {
          const active = hi >= b.from && lo <= b.to;
          return (
            <span
              key={b.label}
              className={`tb-seg${active ? ' on' : ''}`}
              style={{ left: x(b.from - 1), width: `calc(${x(b.to)} - ${x(b.from - 1)})` }}
            >
              <b>{b.label}</b>
              <small>{b.from}–{b.to}</small>
            </span>
          );
        })}
        <i className="tb-threshold" style={{ left: x(7) }} aria-hidden />
        {centerOnThreshold ? null : <i className="tb-marker" style={{ left: x(center) }} aria-hidden />}
      </div>
      <div className="tb-axis">
        {ticks.map((n) => (
          <span key={n} style={{ left: x(n) }}>{n === max ? `${max} 只` : n}</span>
        ))}
      </div>
      <div className="tb-read">
        <span className="tb-current">本档 {model.targets} 只</span>
        <span>金色线 = 7 只开爆发阈值{centerOnThreshold ? '（与中心重合）' : ''}</span>
        {centerOnThreshold ? null : <span>金色点 = {centerLabel}</span>}
        <span>分档轴按目标数分段，不等距</span>
      </div>
    </div>
  );
}
