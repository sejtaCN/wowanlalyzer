import React from 'react';
import { ADJACENT, LEVERAGE, skillName, type AdjacentGroup } from '../../data/content';

/**
 * L0-03「优先级表怎么读」右侧的两张核对图：
 *   ① 禁掉一行，整场输出掉多少（杠杆）
 *   ② 把相邻两行反过来打，顺序本身值多少（相邻交换 A/B）
 * 只读已生成的模拟与 A/B 结果；这里不计算任何新数字。
 */

type LeverageState = 'significant' | 'within-noise' | 'inert';

const STATE_LABEL: Record<LeverageState, string> = {
  significant: '显著',
  'within-noise': '误差内',
  inert: '未生效',
};

/** 三态判据：超出误差上限才算显著；基线伤害为零且差 <1% 记「未生效」（技能没进伤害构成）。 */
function leverageState(deltaPct: number, beyondCi: boolean | null, baselineDps: number): LeverageState {
  if (Math.abs(deltaPct) < 1) return baselineDps > 0 ? 'within-noise' : 'inert';
  return beyondCi ? 'significant' : 'within-noise';
}

export function LeverageBars({ scenarioId = 'st300' }: { scenarioId?: string }) {
  const scenario = LEVERAGE.scenarios.find((item) => item.id === scenarioId) ?? LEVERAGE.scenarios[0];
  const baselineDps = scenario ? LEVERAGE.baseline[scenario.id]?.mean ?? 0 : 0;
  const rows = LEVERAGE.rows
    .filter((row) => row.scenarioId === (scenario?.id ?? scenarioId))
    .slice()
    .sort((a, b) => a.deltaPct - b.deltaPct);
  // 全列出来：只留前几名会把「禁了也没事」的几行藏掉，那正好是最反直觉的部分。
  if (!rows.length) return <div className="figempty">杠杆数据还没跑。</div>;
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.deltaPct)), 0.01);

  return (
    <div className="lev-panel" data-figure-kind="leverage-bars">
      <div className="lev-head">
        <b>禁掉一行，掉多少</b>
        <span className="sec-tag">{scenario?.label ?? '单体 300 秒'} · {LEVERAGE.iterations} 迭代</span>
      </div>
      <p className="lev-note">禁掉一个技能，整场输出相对基线的变化。掉得越多，这一行越省不得。</p>
      <div className="lev-rows">
        {rows.map((row) => {
          const label = skillName(row.skill);
          const state = leverageState(row.deltaPct, row.beyondCi, baselineDps);
          return (
            <div className="lev-row" key={row.runId} data-state={state}>
              <span className="lev-name" title={label.key}>{label.text}</span>
              <span className="lev-track" aria-hidden><i style={{ width: `${(Math.abs(row.deltaPct) / maxAbs) * 100}%` }} /></span>
              <span className="lev-val">{row.deltaPct.toFixed(1)}%</span>
              <span className="lev-state">{STATE_LABEL[state]}</span>
            </div>
          );
        })}
      </div>
      <p className="lev-foot">误差上限由两次模拟的 95% CI 合成，差值没超过就记「误差内」；「未生效」是这一行这次模拟里没进伤害构成。</p>
    </div>
  );
}

const VERDICT_LABEL: Record<string, string> = {
  effective: '顺序有代价',
  structurally_inert: '无效对照',
  within_noise: '差别在误差内',
  inconsistent: '两个场景相反',
  undetermined: '证据不足',
};

export function AdjacentRows() {
  const groups = ADJACENT.groups;
  if (!groups.length) return <div className="figempty">相邻交换还没跑。</div>;
  return (
    <div className="adj-panel" data-figure-kind="adjacent-swap">
      <div className="lev-head">
        <b>把相邻两行反过来打</b>
        <span className="sec-tag">4 组 · 4 个场景 × 2 次重复</span>
      </div>
      <p className="lev-note">每组只交换两行的先后，其余不动。差值就是顺序本身值多少钱。</p>
      <div className="adj-rows">
        {groups.map((group: AdjacentGroup) => {
          const order = group.tableOrder?.length === 2 ? `第 ${group.tableOrder[0]} ↔ ${group.tableOrder[1]} 行` : group.label;
          return (
            <div className="adj-row" key={group.id} data-verdict={group.verdict}>
              <span className="adj-order">{order}</span>
              <span className={`adj-verdict ${group.verdict}`}>{VERDICT_LABEL[group.verdict] ?? group.verdict}</span>
              <span className="adj-val">{group.deltaPct == null ? '—' : `${group.deltaPct.toFixed(1)}%`}</span>
            </div>
          );
        })}
      </div>
      <p className="lev-foot">「无效对照」那一组，被交换的一行在四个场景里 0 次施放，差值来自结构等价，不能读成「顺序不重要」。</p>
    </div>
  );
}
