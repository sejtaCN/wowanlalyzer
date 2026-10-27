import React, { useState } from 'react';
import type { StatOptDoc } from '../data/content';

/**
 * 属性最优化：收益曲线 + 固定预算下的最优配比。
 *
 * 曲线每个点都是真跑一次（把全部预算压在一个属性上，其余归零），不是拟合示意线。
 * 最优解是搜出来的，并且真跑校核过——预测误差、复现差都印在页面里，读者自己判断可信度。
 */

const COLORS: Record<string, string> = {
  crit: 'var(--gold)',
  haste: 'var(--up)',
  mastery: 'var(--curve-a)',
  vers: 'var(--curve-b)',
};

const W = 660;
const H = 214;
const PAD = { l: 48, r: 14, t: 14, b: 34 };

export default function StatCurves({ doc }: { doc: StatOptDoc }) {
  const [sid, setSid] = useState(doc.scenarios[0]?.id ?? 'st');
  const sc = doc.scenarios.find((s) => s.id === sid) ?? doc.scenarios[0];
  const data = doc.perScenario[sc.id];
  if (!data || !data.curves) {
    return <div className="figempty">还没有 {sc?.label ?? sid} 的曲线数据：先跑 npm run statopt。</div>;
  }

  const stats = doc.stats.map((s) => ({ ...s, points: data.curves[s.key] ?? [] }));
  const allDps = [...stats.flatMap((s) => s.points.map((p) => p.dps)), data.currentDps];
  const lo = Math.min(...allDps) * 0.97;
  const hi = Math.max(...allDps) * 1.01;
  const B = data.budget || doc.budget || 1;
  const x = (rating: number) => PAD.l + (rating / B) * (W - PAD.l - PAD.r);
  const y = (dps: number) => PAD.t + (1 - (dps - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const o = data.optimum;

  return (
    <div className="statopt">
      <div className="so-chips">
        {doc.scenarios.map((s) => (
          <button key={s.id} className={`mini${s.id === sid ? ' on' : ''}`} onClick={() => setSid(s.id)}>
            {s.label}
          </button>
        ))}
        <span className="note" style={{ marginLeft: 'auto' }}>
          预算 {B} 评级 · {doc.iterations} 迭代
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${sc.label} 下四个次级属性的收益曲线`}>
        <line x1={PAD.l} y1={y(data.currentDps)} x2={W - PAD.r} y2={y(data.currentDps)} stroke="var(--data-off)" strokeDasharray="4 3" strokeWidth={1} />
        <text x={W - PAD.r} y={y(data.currentDps) - 4} textAnchor="end" fontSize={9} fill="var(--curve-down-soft)">
          现装备 {Math.round(data.currentDps).toLocaleString('en-US')}
        </text>

        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={x(f * B)} y1={PAD.t} x2={x(f * B)} y2={H - PAD.b} stroke="var(--curve-fill)" strokeWidth={1} />
            <text x={x(f * B)} y={H - PAD.b + 12} textAnchor="middle" fontSize={9} fill="var(--curve-down-soft)">
              {Math.round(f * B)}
            </text>
          </g>
        ))}
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <text key={v} x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--curve-down-soft)">
            {Math.round(v / 1000)}k
          </text>
        ))}
        <text x={PAD.l} y={H - 4} fontSize={9} fill="var(--curve-down-soft)">
          横轴：评级（把全部预算压给这一个属性，其余三项为 0）
        </text>
        <text x={PAD.l - 34} y={PAD.t + 6} fontSize={9} fill="var(--curve-down-soft)">
          DPS
        </text>

        {stats.map((st) => (
          <g key={st.key}>
            <polyline points={st.points.map((p) => `${x(p.rating)},${y(p.dps)}`).join(' ')} fill="none" stroke={COLORS[st.key]} strokeWidth={2} />
            {st.points.map((p) => (
              <circle key={p.rating} cx={x(p.rating)} cy={y(p.dps)} r={2.6} fill={COLORS[st.key]}>
                <title>{`${st.label} 全给 ${p.rating} → ${Math.round(p.dps).toLocaleString('en-US')} DPS`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>

      <div className="btl-legend">
        {stats.map((st) => (
          <span key={st.key}>
            <i style={{ background: COLORS[st.key] }} />
            {st.label}
          </span>
        ))}
        <span>虚线 = 现装备（真实评级）下的 DPS</span>
      </div>

      <h3 style={{ marginTop: 14 }}>固定预算下的最优配比（同一份评审点，重新分配）</h3>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 118 }}>输出模型</th>
              {doc.stats.map((s) => (
                <th key={s.key} className="n" style={{ width: 66 }}>{s.label}</th>
              ))}
              <th className="n" style={{ width: 92 }}>实测 DPS</th>
              <th className="n" style={{ width: 82 }}>相对现装备</th>
              <th className="n" style={{ width: 74 }}>预测误差</th>
            </tr>
          </thead>
          <tbody>
            {doc.scenarios.map((s) => {
              const d = doc.perScenario[s.id];
              if (!d) return null;
              const opt = d.optimum;
              return (
                <tr key={s.id} className={s.id === sc.id ? 'ph-mark' : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.label.replace(/（.*?）/g, '')}</td>
                  {doc.stats.map((st) => (
                    <td key={st.key} className="n mono">
                      {opt.ratings[st.key] ?? 0}
                    </td>
                  ))}
                  <td className="n mono">{Math.round(opt.actualDps).toLocaleString('en-US')}</td>
                  <td className={`n ${opt.gainVsCurrentPct > 0 ? 'gear-pos' : 'gear-flat'}`}>
                    {opt.gainVsCurrentPct > 0 ? '+' : ''}
                    {opt.gainVsCurrentPct.toFixed(2)}%
                  </td>
                  <td className="n dim">{opt.absErrorPct.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 6 }}>
        <span className="nowrap">现装备：暴 {data.currentRatings.crit ?? 0}</span> ·{' '}
        <span className="nowrap">急 {data.currentRatings.haste ?? 0}</span> ·{' '}
        <span className="nowrap">精 {data.currentRatings.mastery ?? 0}</span> ·{' '}
        <span className="nowrap">全 {data.currentRatings.vers ?? 0}</span>（合计 {data.budget}）。{' '}
        <span className="nowrap">最优：暴 {o.ratings.crit}</span> · <span className="nowrap">急 {o.ratings.haste}</span> ·{' '}
        <span className="nowrap">精 {o.ratings.mastery}</span> · <span className="nowrap">全 {o.ratings.vers}</span>，实测{' '}
        <span className="nowrap">{Math.round(o.actualDps).toLocaleString('en-US')} DPS</span>，比现装备{' '}
        {o.gainVsCurrentPct >= 0 ? '高' : '低'} <span className="nowrap">{Math.abs(o.gainVsCurrentPct).toFixed(2)}%</span>
        （<span className="nowrap">{o.gainVsCurrentDps >= 0 ? '+' : ''}{Math.round(o.gainVsCurrentDps).toLocaleString('en-US')} DPS</span>）。
      </div>
      <div className="note" style={{ marginTop: 4 }}>
        复现校核：用当前评级作为绝对值重跑，与现装备的差 {data.reproduced.gapPct}%{data.reproduced.ok ? '（通过，覆盖语义吃透了）' : '（未通过，别用这组数）'}。
      </div>
      <div className="note" style={{ marginTop: 4 }}>
        方法：{doc.method.curves} {doc.method.optimize} {doc.method.validate}
      </div>
      {doc.caveats.map((c) => (
        <div key={c} className="note" style={{ marginTop: 4 }}>
          限制：{c}
        </div>
      ))}
    </div>
  );
}
