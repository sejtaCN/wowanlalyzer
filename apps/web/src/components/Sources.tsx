import React from 'react';
import type { CrosscheckDoc, SourcesSummary } from '../data/content';

/**
 * 参考资料：四家原文说了什么、哪几句可以当结论、哪几句要打问号。
 *
 * 数据两处：
 *   - content/guides/sources-summary.json（每家的要点摘录，人工从原文摘）
 *   - content/guides/crosscheck-archon.json（一致项 / 分歧项 / 我们的裁决）
 * 页面只做呈现与并置，不在渲染层调和分歧。
 */

const STATUS_LABEL: Record<string, { text: string; tone: 'ok' | 'warn' | 'info' }> = {
  resolved_by_apl: { text: 'APL 已裁决', tone: 'ok' },
  consistent: { text: '说法一致', tone: 'ok' },
  low_impact: { text: '差异不影响结论', tone: 'info' },
  naming: { text: '术语差异', tone: 'info' },
  needs_sim_check: { text: '待跑批复核', tone: 'warn' },
};

export default function Sources({ summary, crosscheck }: { summary: SourcesSummary; crosscheck: CrosscheckDoc }) {
  return (
    <div className="sources">
      <div className="src-grid">
        {summary.sources.map((s) => (
            <div className="src-card" key={s.id}>
              <div className="src-hd">
                <b>{s.name}</b>
                <span className="sec-tag">{s.version}</span>
              </div>
              <div className="src-meta">
                {s.type} · <a href={s.url} target="_blank" rel="noreferrer">原文</a>
              </div>
              <ul className="src-points">
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <div className="src-note">
                <b>特点</b>：{s.feature}
              </div>
              <div className="src-note warn">
                <b>局限</b>：{s.limit}
              </div>
            </div>
        ))}
      </div>

      <h3>四家一致的（可以直接当结论）</h3>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 180 }}>结论</th>
              <th style={{ width: 150 }}>哪几家</th>
              <th>原文怎么说</th>
            </tr>
          </thead>
          <tbody>
            {crosscheck.agreements.map((a) => (
              <tr key={a.point}>
                <td>{a.point}</td>
                <td className="dim">{a.sources.length} 家</td>
                <td className="dim">{a.detail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 16 }}>四家不一致的（以及怎么处理）</h3>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 104 }}>分歧</th>
              <th>各家说法</th>
              <th style={{ width: 208 }}>处理方式</th>
              <th style={{ width: 122 }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {crosscheck.divergences.map((d) => {
              const st = STATUS_LABEL[d.status] ?? { text: d.status, tone: 'info' as const };
              const claims = [d.method, d.maxroll, d.nga, d.detail].filter(Boolean) as string[];
              return (
                <React.Fragment key={d.id}>
                  <tr>
                    <td style={{ fontWeight: 500 }}>{d.point}</td>
                    <td className="dim">
                      {claims.map((c, i) => (
                        <div key={i}>{c}</div>
                      ))}
                    </td>
                    <td className="dim">{d.verdict ?? '—'}</td>
                    <td>
                      <span className={`state ${st.tone === 'warn' ? 'flat' : 'unused'}`} style={st.tone === 'ok' ? { color: 'var(--up)' } : undefined}>
                        {st.text}
                      </span>
                    </td>
                  </tr>
                  {d.apl ? (
                    <tr>
                      <td colSpan={4} className="src-apl">
                        <b>APL 原文</b> <span className="mono">{d.apl}</span>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 10 }}>
        {summary.howWeUse}
      </div>
      <div className="note" style={{ marginTop: 4 }}>
        抓取时间 {summary.generatedAt} · 基线 {summary.baseline}。四条英雄天赋机制（光晕送鞭笞：狂、共振能量增伤）目前只有原文支持，本站没有单独跑批。
      </div>
    </div>
  );
}
