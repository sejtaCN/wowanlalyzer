import React from 'react';
import type { BudgetScenario } from '../../data/content';
import { Gloss } from '../Gloss';

const ROLE_ORDER = ['dot', 'filler', 'burst', 'item'] as const;

const fmt = (n: number, d = 1) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * ① 的动作预算：只回答三件事——时间花在哪、狂乱怎么走、这些数字能信到什么程度。
 * 不把动作数叫作 GCD；GCD 起手点按不同起始时间去重。
 */
export default function ActionBudget({ data }: { data: BudgetScenario }) {
  const { resource, series, durationSec } = data;
  const W = 500;
  const H = 58;
  const PAD = 4;
  const x = (t: number) => PAD + (t / durationSec) * (W - PAD * 2);
  const y = (v: number) => PAD + ((resource.cap - v) / resource.cap) * (H - PAD * 2);
  const points = series.map((s) => `${x(s.t).toFixed(1)},${y(s.insanity).toFixed(1)}`).join(' ');
  const peak = series.reduce((best, s) => (s.insanity > best.insanity ? s : best), series[0]);
  const spends = series
    .map((s, i) => ({ ...s, drop: i > 0 ? s.insanity - series[i - 1].insanity : 0 }))
    .filter((s) => s.drop < -1);

  return (
    <div className="pb" data-figure-kind="play-budget">
      <div className="pb-hd">
        <b>{durationSec} 秒的动作预算</b>
        <span className="note">爆发全开上限 · 代表迭代 · {data.label}</span>
      </div>
      <div className="pb-equation">
        <b>{data.actionCount}</b> 个动作 = <b>{data.gcdStarts}</b> 个 GCD 起手点 + <b>{data.sameMomentExtras}</b> 个同刻动作
      </div>

      <div className="kpis pb-kpis">
        <div>
          <div className="k">总动作</div>
          <div className="v">{data.actionCount}<small> 个</small></div>
        </div>
        <div>
          <div className="k"><Gloss text="GCD 起手点" />（去重）</div>
          <div className="v">{data.gcdStarts}<small> 次</small></div>
        </div>
        <div>
          <div className="k">起手间隔中位</div>
          <div className="v">{data.medianStartGapSec}<small> 秒</small></div>
        </div>
        <div>
          <div className="k">狂乱峰值</div>
          <div className="v">{fmt(resource.max)}<small> / {resource.cap}</small></div>
        </div>
      </div>

      <div className="pb-roles" aria-label="按职责拆分的动作数">
        <div className="pb-bar">
          {ROLE_ORDER.map((k) => (
            <i
              key={k}
              className={`pb-seg ${k}`}
              style={{ width: `${data.byRole[k].share * 100}%` }}
              title={`${data.byRole[k].label} ${data.byRole[k].count} 个`}
            />
          ))}
        </div>
        <div className="pb-legend">
          {ROLE_ORDER.map((k) => (
            <span key={k}>
              <i className={`pb-dot ${k}`} />
              {data.byRole[k].label} <b>{data.byRole[k].count}</b>
            </span>
          ))}
        </div>
        <p className="note">
          {data.sameMomentExtras
            ? `${data.sameMomentExtras} 个动作与另一动作同刻（药水 / 饰品 / 能量灌注），不占新的起手点。`
            : '没有同刻动作，动作数就是起手点数。'}
        </p>
      </div>

      <div className="pb-res">
        <div className="pb-res-hd">
          <span>狂乱值 · 动作采样</span>
          <span className="mono">起 {fmt(resource.start)} / 止 {fmt(resource.end)}</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`狂乱值从 ${resource.start} 到 ${resource.end}，峰值 ${resource.max}，${resource.spendEvents} 次下降`}
        >
          <line className="pb-grid" x1={PAD} x2={W - PAD} y1={y(resource.cap)} y2={y(resource.cap)} />
          <polyline className="pb-line" points={points} vectorEffect="non-scaling-stroke" />
          <circle
            className="pb-peak"
            cx={x(peak.t)}
            cy={y(peak.insanity)}
            r={2.6}
            vectorEffect="non-scaling-stroke"
          />
          {spends.map((s) => (
            <circle
              key={`${s.t}-${s.name}`}
              className="pb-spend"
              cx={x(s.t)}
              cy={y(s.insanity)}
              r={2.2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="pb-axis">
          <span>0s</span>
          <span>纵轴 0–100 · 金点 = 峰值</span>
          <span>{durationSec}s</span>
        </div>
        <p className="note">
          红点 = 消耗；{resource.spendEvents} 次下降 · 观测回复 {fmt(resource.observedGain)} / 消耗 {fmt(resource.observedSpend)} ·
          净变化 {resource.net > 0 ? '+' : ''}{fmt(resource.net)}。{resource.samplesAtCap ? '有采样触顶，溢出仍需事件级数据。' : '采样点没触顶；这不等于没有溢出。'}
        </p>
      </div>

      <p className="note pb-limit">
        动作来自一次「爆发全开」的代表迭代，不是本章的推荐动作；DPS 是 {data.dps.samples} 次迭代的均值 ±{data.dps.ci95Pct}%。木桩满 uptime，不含走位、转火与打断，所以这是时间上限，不是副本里的可用时间。
      </p>
    </div>
  );
}
