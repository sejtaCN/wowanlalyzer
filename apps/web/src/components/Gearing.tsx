import React from 'react';
import type { GearingDoc } from '../data/content';

/**
 * 配装参考：次级属性 / 附魔 / 消耗品 / 饰品在不同输出模型里值多少。
 *
 * 两个来源，别混：
 *   - 次级属性 → SimC calculate_scale_factors，每 700 点（约一颗宝石当量）涨几 %
 *   - 附魔 / 武器油 / 饰品 → 从 profile 里摘掉那一样重跑，掉几 %
 * 差值落在 95% CI 内的不打绿也不打红，标「误差内」。
 */

const CI_FLOOR = 0.3; // 两次跑批的 CI 合起来约 0.3 个百分点，低于它不算结论

function tone(v: number | null | undefined) {
  if (v == null) return 'na';
  if (Math.abs(v) < CI_FLOOR) return 'flat';
  return v > 0 ? 'pos' : 'neg';
}

export default function Gearing({ doc, hero }: { doc: GearingDoc; hero: string }) {
  const scs = doc.scenarios;

  // 每个属性里最高的那个模型，标出来——"同一属性换模型就更值钱"是这一页的主张
  const bestByStat = new Map<string, string>();
  for (const row of doc.secondary) {
    let best: { id: string; v: number } | null = null;
    for (const sc of scs) {
      const v = row.perPct[sc.id];
      if (v == null) continue;
      if (!best || v > best.v) best = { id: sc.id, v };
    }
    if (best) bestByStat.set(row.stat, best.id);
  }

  return (
    <div className="gear" data-hero={hero}>
      <h3>次级属性：每 700 点（约一颗宝石当量）换来多少</h3>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 96 }}>属性</th>
              {scs.map((sc) => (
                <th key={sc.id} style={{ width: 104 }} className="n">{sc.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.secondary.map((row) => {
              const best = bestByStat.get(row.stat);
              return (
                <tr key={row.stat}>
                  <td style={{ fontWeight: 500 }}>{row.label}</td>
                  {scs.map((sc) => {
                    const v = row.perPct[sc.id];
                    return (
                      <td key={sc.id} className={`n ${best === sc.id ? 'gear-best' : ''}`}>
                        {v == null ? '—' : `+${v.toFixed(1)}%`}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 6 }}>
        灰色 = 差值在误差带内（|Δ| &lt; 0.3 个百分点，等于没影响）。读法：同一行四个数不一样，说明「哪个属性最好」取决于你在打什么——单体堆一个、8 目标堆另一个。金色 = 这一行里最高的模型。
      </div>

      <h3 style={{ marginTop: 18 }}>武器附魔 / 武器油 / 美化 / 饰品 / 套装：摘掉它掉多少</h3>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 232 }}>摘掉</th>
              {scs.map((sc) => (
                <th key={sc.id} style={{ width: 104 }} className="n">{sc.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.effects.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {e.label}
                  {e.kind !== 'enchant' ? (
                    <span className="dim" style={{ marginLeft: 6 }}>
                      ·{' '}
                      {e.kind === 'trinket'
                        ? '属性 + 特效'
                        : e.kind === 'consumable'
                          ? '消耗品'
                          : e.kind === 'embellishment'
                            ? 'crafted bonus'
                            : '套装效果'}
                    </span>
                  ) : null}
                </td>
                {scs.map((sc) => {
                  const cell = e.perScenario[sc.id];
                  const v = cell?.deltaPct ?? null;
                  const t = tone(v);
                  return (
                    <td key={sc.id} className={`n gear-${t}`} title={cell ? `${cell.runId}（基线 ${cell.baseRunId}）` : undefined}>
                      {v == null ? '—' : <span className="mono">{`${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`casebox`} style={{ marginTop: 10 }}>
        <b>{doc.control.label}</b>
        <div style={{ marginTop: 4 }}>
          摘掉整把武器后：{scs.map((sc) => {
            const c = doc.control.perScenario[sc.id];
            return <span key={sc.id} style={{ marginRight: 12 }}>{sc.label} {c ? `${c.deltaPct?.toFixed(1)}%` : '—'}</span>;
          })}
          {' '}——必须掉一大截；不掉说明这套 A/B 没在测东西。当前判定：<b>{doc.control.passed ? '通过' : '不通过，别信上面的数'}</b>。
        </div>
      </div>

      <div className="note" style={{ marginTop: 10 }}>
        方法：{doc.method.secondary} {doc.method.effects}
      </div>
      <div className="note" style={{ marginTop: 4, color: 'var(--ink-on-gold-soft)' }}>
        口径限制：{doc.method.caveat}
      </div>
      <div className="note" style={{ marginTop: 4 }}>
        基线 DPS：
        {scs.map((sc) => {
          const b = doc.baseline[sc.id];
          return <span key={sc.id} style={{ marginRight: 12 }}>{sc.label} {b ? Math.round(b.dps).toLocaleString() : '—'}（±{b?.ci95Pct ?? '—'}%）</span>;
        })}
        · {doc.iterations} 迭代/次
      </div>
    </div>
  );
}
