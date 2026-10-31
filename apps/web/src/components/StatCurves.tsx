import React, { useState } from 'react';
import type { StatOptDoc } from '../data/content';

/**
 * 属性最优化：收益曲线 + 固定预算下的最优配比。
 *
 * 曲线每个点都是真跑一次（把全部预算压在一个属性上，其余归零），不是拟合示意线。
 * 最优解是搜出来的，并且真跑校核过——预测误差、复现差都印在页面里，读者自己判断可信度。
 */

const COLORS: Record<string, string> = {
  crit: 'var(--stat-crit)',
  haste: 'var(--stat-haste)',
  mastery: 'var(--stat-mastery)',
  vers: 'var(--stat-vers)',
};

const DASH: Record<string, string | undefined> = {
  crit: undefined,
  haste: '8 5',
  mastery: '2 5',
  vers: '10 4 2 4',
};

const W = 660;
const H = 214;
const PAD = { l: 48, r: 14, t: 14, b: 34 };

export default function StatCurves({ doc, hero }: { doc: StatOptDoc; hero: string }) {
  const [sid, setSid] = useState(doc.scenarios[0]?.id ?? 'st');
  const sc = doc.scenarios.find((s) => s.id === sid) ?? doc.scenarios[0];
  const data = doc.perScenario[sc.id];
  if (!data || !data.curves) {
    return <div className="figempty">还没有 {sc?.label ?? sid} 的曲线数据。</div>;
  }

  const stats = doc.stats.map((s) => ({ ...s, points: data.curves[s.key] ?? [] }));
  const allDps = [...stats.flatMap((s) => s.points.map((p) => p.dps)), data.zeroDps];
  const lo = Math.min(...allDps) * 0.97;
  const hi = Math.max(...allDps) * 1.01;
  const B = data.budget || doc.budget || 1;
  const x = (rating: number) => PAD.l + (rating / B) * (W - PAD.l - PAD.r);
  const y = (dps: number) => PAD.t + (1 - (dps - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const o = data.optimum;
  const scenarioRows = doc.scenarios
    .map((scenario) => ({ scenario, data: doc.perScenario[scenario.id] }))
    .filter(
      (entry): entry is {
        scenario: (typeof doc.scenarios)[number];
        data: NonNullable<typeof entry.data>;
      } => Boolean(entry.data),
    );
  const maxCurveGain = Math.max(
    ...scenarioRows.flatMap(({ data: row }) =>
      doc.stats.flatMap((stat) => {
        const points = row.curves[stat.key] ?? [];
        const last = points[points.length - 1];
        return last ? [last.dps / row.zeroDps - 1] : [];
      }),
    ),
    0.01,
  );
  const bestGainByScenario = new Map(
    scenarioRows.map(({ scenario, data: row }) => [
      scenario.id,
      Math.max(
        ...doc.stats.map((stat) => {
          const points = row.curves[stat.key] ?? [];
          const last = points[points.length - 1];
          return last ? (last.dps / row.zeroDps - 1) * 100 : 0;
        }),
      ),
    ]),
  );

  return (
    <div className="statopt" data-hero={hero}>
      <div className="so-chips">
        {doc.scenarios.map((s) => (
          <button key={s.id} className={`mini${s.id === sid ? ' on' : ''}`} onClick={() => setSid(s.id)}>
            {s.label}
          </button>
        ))}
        <span className="note" style={{ marginLeft: 'auto' }}>
          固定测试预算 {B} 评级 · {doc.iterations} 迭代
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${sc.label} 下四个次级属性的收益曲线`}>
        <line x1={PAD.l} y1={y(data.zeroDps)} x2={W - PAD.r} y2={y(data.zeroDps)} stroke="var(--data-off)" strokeDasharray="4 3" strokeWidth={1} />
        <text x={W - PAD.r} y={y(data.zeroDps) - 4} textAnchor="end" fontSize={9} fill="var(--curve-down-soft)">
          全零评级基准 {Math.round(data.zeroDps).toLocaleString('en-US')}
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
            <polyline
              points={st.points.map((p) => `${x(p.rating)},${y(p.dps)}`).join(' ')}
              fill="none"
              stroke={COLORS[st.key]}
              strokeWidth={2.4}
              strokeDasharray={DASH[st.key]}
            />
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
            <i className={`stat-line-key ${st.key}`} />
            {st.label}
          </span>
        ))}
        <span>虚线水平线 = 四项全零基准；属性线型同时区分四项</span>
      </div>

      <h3 style={{ marginTop: 14 }}>固定预算下的最优配比（同一组评级点，重新分配）</h3>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 118 }}>输出模型</th>
              {doc.stats.map((s) => (
                <th key={s.key} className="n" style={{ width: 66 }}>{s.label}</th>
              ))}
              <th className="n" style={{ width: 92 }}>实测 DPS</th>
              <th className="n" style={{ width: 82 }}>相对全零</th>
              <th className="n" style={{ width: 74 }}>预测误差</th>
            </tr>
          </thead>
          <tbody>
            {doc.scenarios.map((s) => {
              const d = doc.perScenario[s.id];
              if (!d) return null;
              const opt = d.optimum;
              const gainVsZeroPct = (opt.actualDps / d.zeroDps - 1) * 100;
              return (
                <tr key={s.id} className={s.id === sc.id ? 'ph-mark' : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.label.replace(/（.*?）/g, '')}</td>
                  {doc.stats.map((st) => (
                    <td key={st.key} className="n mono">
                      {opt.ratings[st.key] ?? 0}
                    </td>
                  ))}
                  <td className="n mono">{Math.round(opt.actualDps).toLocaleString('en-US')}</td>
                  <td className={`n ${gainVsZeroPct > 0 ? 'gear-pos' : 'gear-flat'}`}>
                    {gainVsZeroPct > 0 ? '+' : ''}
                    {gainVsZeroPct.toFixed(2)}%
                  </td>
                  <td className="n dim">{opt.absErrorPct.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 6 }}>
        固定测试预算 {data.budget} 点评级，不读取玩家当前装备或人物属性。当前模型最优分布：
        <span className="nowrap">暴 {o.ratings.crit}</span> · <span className="nowrap">急 {o.ratings.haste}</span> ·{' '}
        <span className="nowrap">精 {o.ratings.mastery}</span> · <span className="nowrap">全 {o.ratings.vers}</span>，实测{' '}
        <span className="nowrap">{Math.round(o.actualDps).toLocaleString('en-US')} DPS</span>。
      </div>
      <div className="note" style={{ marginTop: 4 }}>
        基准复现：沿用同一固定测试条件重跑，差值 {data.reproduced.gapPct}%{data.reproduced.ok ? '（通过）' : '（未通过，别用这组数）'}。
      </div>
      <h3 style={{ marginTop: 18 }}>四个输出模型的属性分配，哪里必须改</h3>
      <p className="statopt-lead">
        每一行是一套固定预算内的最优评级。四项合计都是 3209；全能 9 占比太小，条上以细线标出，完整数值见每行说明。
      </p>
      <div className="stat-alloc" role="list" aria-label="四个输出模型的属性最优配比">
        {scenarioRows.map(({ scenario, data: row }) => (
          <div className={`stat-alloc-row${scenario.id === sid ? ' on' : ''}`} role="listitem" key={scenario.id}>
            <div className="stat-alloc-hd">
              <b>{scenario.label}</b>
              <span>相对全零 +{((row.optimum.actualDps / row.zeroDps - 1) * 100).toFixed(2)}%</span>
            </div>
            <div className="stat-alloc-bar">
              {doc.stats.map((stat) => {
                const rating = row.optimum.ratings[stat.key] ?? 0;
                return rating > 0 ? (
                  <i
                    className={`stat-alloc-seg ${stat.key}${rating / row.budget < 0.015 ? ' tiny' : ''}`}
                    key={stat.key}
                    style={rating / row.budget < 0.015 ? { flex: '0 0 7px' } : { flex: rating }}
                    title={`${stat.label} ${rating} 评级`}
                  >
                    <span>{rating / row.budget < 0.015 ? '' : rating}</span>
                  </i>
                ) : null;
              })}
            </div>
            <div className="stat-alloc-detail">
              {doc.stats.map((stat) => (
                <span key={stat.key}>
                  <i className={`stat-dot ${stat.key}`} />
                  {stat.label} {row.optimum.ratings[stat.key] ?? 0}
                  {(row.optimum.ratings[stat.key] ?? 0) / row.budget < 0.015 ? <small>（图中以细线表示）</small> : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>各模型内部，哪个属性满预算收益最高</h3>
      <p className="statopt-lead">
        数字是“把全部预算都给这一项”相对全零基准的 DPS 增益。只比同一列内的四项；色阶是列内相对值，不用于跨模型比较。
      </p>
      <div className="stat-heat" role="table" aria-label="四个输出模型下各属性的满预算收益">
        <div className="stat-heat-row stat-heat-head" role="row">
          <span role="columnheader">属性</span>
          {scenarioRows.map(({ scenario }) => (
            <span role="columnheader" key={scenario.id} aria-current={scenario.id === sid ? 'true' : undefined}>
              {scenario.label}
              {scenario.id === sid ? <em>当前模型</em> : null}
            </span>
          ))}
        </div>
        {doc.stats.map((stat) => (
          <div className="stat-heat-row" role="row" key={stat.key}>
            <span role="rowheader"><i className={`stat-dot ${stat.key}`} />{stat.label}</span>
            {scenarioRows.map(({ data: row, scenario }) => {
              const points = row.curves[stat.key] ?? [];
              const last = points[points.length - 1];
              const gain = last ? (last.dps / row.zeroDps - 1) * 100 : null;
              const intensity = gain == null ? 0 : Math.min(1, gain / (maxCurveGain * 100));
              const isBest = gain != null && Math.abs(gain - (bestGainByScenario.get(scenario.id) ?? 0)) < 0.05;
              return (
                <span
                  key={scenario.id}
                  role="cell"
                  className={`stat-heat-cell${scenario.id === sid ? ' on' : ''}${isBest ? ' best' : ''}`}
                  style={{ background: `rgba(245, 196, 81, ${0.08 + intensity * 0.38})` }}
                  title={last ? `${stat.label} · ${scenario.label}：${Math.round(last.rating)} 评级 → ${Math.round(last.dps).toLocaleString('zh-CN')} DPS${isBest ? '（本模型最高）' : ''}` : undefined}
                >
                  {gain == null ? '—' : <>{isBest ? <b aria-label="本模型最高">▲ </b> : null}+{gain.toFixed(1)}%</>}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="stat-heat-key">
        <i /> 深色 = 同一列内更高收益 · 当前模型列带「当前」标签
      </p>
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
