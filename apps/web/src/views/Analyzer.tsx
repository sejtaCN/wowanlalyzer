import React, { useMemo, useState } from 'react';
import { allRuns, CROSSCHECK, GEARING, INTERACTIONS, LEVERAGE, SHARE, SOURCES_SUMMARY, STAT_OPT } from '../data/content';
import { InteractionGraph, LeverageChart, ShareTable } from '../components/Analysis';
import Gearing from '../components/Gearing';
import StatCurves from '../components/StatCurves';
import Sources from '../components/Sources';
import { Section } from '../components/ChapterSections';

/**
 * 解析台：与章节页同一套语言——纵向六段，每段一张图 + 一句说明。
 * 原来用 tab 切换（工具语气），现在六段一眼看到底：读者总是"先看结构、再看量"。
 */
export default function Analyzer() {
  const runs = allRuns();
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const filtered = runs.filter((r) =>
      `${r.runId} ${r.label ?? ''} ${r.scenarioId ?? ''}`.toLowerCase().includes(q.toLowerCase()),
    );
    const map = new Map<string, typeof runs>();
    for (const r of filtered) {
      const key =
        r.kind === 'leverage' || r.kind === 'leverage-baseline'
          ? '杠杆（禁用技能）'
          : r.kind === 'decision-ab'
            ? '决策 A/B'
            : r.kind === 'gearing'
              ? '配装'
              : r.kind === 'stat-opt'
                ? '属性优化'
                : r.kind === 'action-trace'
                  ? '动作轨迹'
                  : r.kind === 'adds-window'
                    ? '加怪窗口'
                    : '基础场景';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [runs, q]);

  const simc = runs[0]?.simc;
  const levReal = LEVERAGE.rows.filter((r) => r.beyondCi).length;
  const shareScenarios = Object.keys(SHARE.scenarios).length;
  const abCount = runs.filter((r) => r.kind === 'decision-ab').length;

  return (
    <div className="page">
      <h1>解析台</h1>
      <p className="page-sub">
        当前只展示执政官这一套天赋。学习页给的每个数字都在这里能查到出处。从上往下读：结构 → 数量 → 构成 → 配装 → 参考资料 → 原始结果。
      </p>

      <p className="note">
        <a href="#grp-decision-ab">决策 A/B：{abCount} 条对照记录，跳到原始结果</a>
      </p>

      <div className="statusline" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
        <span>SimC {simc?.version ?? '—'} ({simc?.commit?.slice(0, 7) ?? '—'})</span>
        <span>执政官 runId {runs.length} 个</span>
        <span>杠杆 {LEVERAGE.scenarios.length} 场景 × {LEVERAGE.rows.length} 技能</span>
        <span>联动边 {INTERACTIONS.counts.apl + INTERACTIONS.counts.applies + INTERACTIONS.counts.burst + INTERACTIONS.counts.opener} 条</span>
        <span>配装 {GEARING.effects.length} 项 × {GEARING.scenarios.length} 模型</span>
        <span>参考 {SOURCES_SUMMARY.sources.length} 家</span>
      </div>

      <Section
        no="①"
        question="谁依赖谁"
        tag="APL 条件 + 日志窗口"
        note={`${INTERACTIONS.counts.apl} 条来自 APL 的 DoT 与增益条件（可复现），${INTERACTIONS.counts.burst} 条来自爆发窗口内的施法占比（真实日志）。线越粗，占比越高。`}
      >
        <InteractionGraph hero="archon" />
      </Section>

      <Section
        no="②"
        question="少它会掉多少"
        tag={`${LEVERAGE.iterations} 迭代`}
        note={`把技能在 APL 里的动作行全部注释掉再重跑：${LEVERAGE.rows.length} 条里有 ${levReal} 条超出保守误差上限。上限内或 CI 不完整的都不算结论。`}
      >
        <LeverageChart hero="archon" />
      </Section>

      <Section
        no="③"
        question="伤害从哪来"
        tag={`${shareScenarios} 个场景`}
        note="占比高不等于重要：光晕占 1.5% 伤害，禁掉却掉 13.5%——两条一起看才知道该保哪个。"
      >
        <ShareTable hero="archon" />
      </Section>

      <Section
        no="④"
        question="换个输出模型，这件东西还值多少"
        tag={`${GEARING.effects.length} 项 · ${GEARING.scenarios.length} 个模型`}
        note={`属性不是常数：同一行四个模型数字不同，说明「堆什么」取决于你在打什么。预算固定 ${STAT_OPT.budget} 评点时，最优配比在四个模型里各不相同（见下表）。阳性对照（整把武器拿掉 ${GEARING.control.perScenario[GEARING.scenarios[0].id]?.deltaPct?.toFixed(0) ?? '—'}%）${GEARING.control.passed ? '通过，读数可信' : '没通过，别信这次读数'}。`}
      >
        <StatCurves doc={STAT_OPT} hero="archon" />
        <Gearing doc={GEARING} hero="archon" />
      </Section>

      <Section
        no="⑤"
        question="攻略是谁说的，这里验了什么"
        tag={`${SOURCES_SUMMARY.sources.length} 家原文`}
        note={`四家一致 ${CROSSCHECK.agreements.length} 条直接进正文；分歧 ${CROSSCHECK.divergences.length} 条不挑权威，交给 APL 与 runId 裁决。原文抓取时间 ${SOURCES_SUMMARY.generatedAt}。`}
      >
        <Sources summary={SOURCES_SUMMARY} crosscheck={CROSSCHECK} />
      </Section>

      <Section
        no="⑥"
        question="原始结果在哪"
        tag={`执政官 · ${runs.length} 个 runId`}
        note="只列出明确归属执政官的模拟文件；每一行都带 SimC 版本、commit、迭代数和 95% CI。虚空编织者数据待补，不在此混列。"
      >
        <input
          className="filter"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="筛选场景或记录号"
          aria-label="筛选模拟记录"
        />
        <div className="tblwrap">
          {groups.map(([name, rows]) => (
            <div key={name} id={name === '决策 A/B' ? 'grp-decision-ab' : undefined} style={{ marginBottom: 18 }}>
              <h3 style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                {name}
                <span className="note">{rows.length} 条</span>
              </h3>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>场景</th>
                    <th className="n">DPS</th>
                    <th className="n">±CI</th>
                    <th className="n">n</th>
                    <th>runId</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((r) => (
                    <tr key={r.runId}>
                      <td>{r.label ?? r.scenarioId ?? '—'}</td>
                      <td className="n">{Math.round(r.dps).toLocaleString()}</td>
                      <td className="n dim">{r.ci95Pct != null ? `±${r.ci95Pct.toFixed(2)}%` : '—'}</td>
                      <td className="n dim">{r.samples ?? '—'}</td>
                      <td className="mono dim">{r.runId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 60 ? <div className="note">只显示前 60 条（共 {rows.length}）。</div> : null}
            </div>
          ))}
          {!groups.length ? <div className="figempty">没有匹配的 runId。</div> : null}
        </div>
      </Section>
    </div>
  );
}
