import React from 'react';
import type { PriorityShift } from '@learn';
import { prioritySections, skillName } from '../../data/content';
import { Gloss } from '../Gloss';

/**
 * 优先级位置图：从 APL 表里找每条改动的真实序号，没有独立行的伪技能写“循环入口”。
 * 不新增一套技能顺序；顺序、条件、选目标都来自 priority-table.json。
 */
export default function PriorityMap({
  add,
  drop,
  level,
}: {
  add: PriorityShift[];
  drop: PriorityShift[];
  level?: string;
}) {
  const rows = prioritySections().flatMap((section) =>
    section.rows.map((row) => ({ ...row, sectionLabel: section.label })),
  );
  const all = [
    ...add.map((item) => ({ ...item, tone: 'add' as const })),
    ...drop.map((item) => ({ ...item, tone: 'drop' as const })),
  ];
  const withOrder = all.map((item) => {
    const hits = rows.filter((row) => row.skill === item.skill);
    const first = hits.slice().sort((a, b) => a.order - b.order)[0];
    return { ...item, order: first?.order ?? null, row: first ?? null };
  });
  const maxOrder = Math.max(1, ...rows.map((r) => r.order));
  const up = level === 'L0' ? '往上调' : '这一波要加';
  const down = level === 'L0' ? '往下调' : '这一波要降';

  if (!withOrder.length) return <div className="figempty">这一章没有优先级改动。</div>;

  return (
    <div className="priority-map pm-reader" data-figure-kind="priority-map">
      <div className="pm-legend">
        <span><i className="pm-key add" />{up}</span>
        <span><i className="pm-key drop" />{down}</span>
        <span>数字是这条改动在优先级表里的位置；没有独立行的写「循环入口」</span>
      </div>
      <div className="pm-overview" aria-hidden>
        <span>APL #1</span>
        {withOrder.filter((x) => x.order != null).map((x) => (
          <i key={`${x.tone}-${x.skill}`} className={x.tone} style={{ left: `${(x.order! / maxOrder) * 100}%` }} />
        ))}
        <span>#{maxOrder}</span>
      </div>
      <div className="pm-list">
        {withOrder.map((item) => {
          const label = skillName(item.skill);
          const name = label.text;
          const visibleName = item.skill === 'aoe_loop' ? '多目标循环' : name;
          return (
            <div className={`pm-row ${item.tone}`} key={`${item.tone}-${item.skill}`}>
              <div className="pm-order">
                {item.order == null ? <span className="pm-loop">循环<br />入口</span> : <><small>#</small>{item.order}</>}
              </div>
              <div className="pm-body">
                <div className="pm-head">
                  <b title={item.skill}>{label.verified ? visibleName : `「${visibleName}」`}</b>
                  {!label.verified ? <span className="sec-tag pending">待核对</span> : null}
                  <span className={`pm-tag ${item.tone}`}>{item.tone === 'add' ? up : down}</span>
                </div>
                <div className="pm-reason"><Gloss text={item.reason} /></div>
                <div className="pm-evidence">{item.evidence}</div>
                {item.raw ? (
                  <details className="pm-raw">
                    <summary>APL 原始写法</summary>
                    <code>{item.raw}</code>
                  </details>
                ) : null}
                {item.order != null ? (
                  <div className="pm-pos" aria-hidden><i style={{ left: `${(item.order / maxOrder) * 100}%` }} /></div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
