import React from 'react';
import type { SimulatedTimeline, SimulatedTimelinePhase } from '../../data/content';

const ROLE_ORDER = ['dot', 'filler', 'burst', 'item'] as const;
const ROLE_LABEL: Record<(typeof ROLE_ORDER)[number], string> = {
  dot: 'DoT',
  filler: '填充 / 直伤',
  burst: '爆发 / 增益',
  item: '药水 / 饰品',
};

const ROLE_OF: Record<SimulatedTimelinePhase['byAction'][number]['name'], (typeof ROLE_ORDER)[number]> = {
  tentacle_slam: 'dot',
  shadow_word_pain: 'dot',
  shadow_word_madness: 'dot',
  vampiric_touch: 'dot',
  mind_flay: 'filler',
  mind_flay_insanity: 'filler',
  mind_blast: 'filler',
  void_volley: 'filler',
  shadow_word_death: 'filler',
  voidform: 'burst',
  halo: 'burst',
  power_infusion: 'burst',
  potion: 'item',
  use_items: 'item',
};

/** 模拟执行时间线：三阶段横带 + 动作职责构成；不叫真人阶段。 */
export default function SimulatedTimelineFigure({ timeline }: { timeline: SimulatedTimeline }) {
  const max = Math.max(...timeline.phases.map((p) => p.actions), 1);
  return (
    <div className="simtl" data-figure-kind="phase-chart" data-source-kind="simulation">
      <span className="simtl-source">模拟执行 · 非真人日志</span>
      <div className="simtl-hd">
        <b>{timeline.label}</b>
        <span>{timeline.durationSec.toFixed(1)} 秒 · 代表迭代</span>
      </div>
      <div className="simtl-track" role="list" aria-label={`${timeline.label} 三分段动作构成`}>
        {timeline.phases.map((phase) => (
          <div className="simtl-phase" key={phase.index} role="listitem">
            <div className="simtl-bar" style={{ height: `${Math.max(18, (phase.actions / max) * 100)}%` }}>
              {ROLE_ORDER.map((role) => (
                <i
                  key={role}
                  className={`simtl-seg ${role}`}
                  style={{ flex: phase[role] }}
                  title={`${ROLE_LABEL[role]} ${phase[role]} 个`}
                />
              ))}
            </div>
            <b>{phase.actions} 个动作</b>
            <small>{phase.from.toFixed(1)}–{phase.to.toFixed(1)}s</small>
          </div>
        ))}
      </div>
      <div className="simtl-legend">
        <div className="simtl-role-legend" role="list" aria-label="动作职责图例">
          {ROLE_ORDER.map((role) => (
            <span key={role} role="listitem"><i className={`simtl-seg ${role}`} />{ROLE_LABEL[role]}</span>
          ))}
        </div>
        <span>阶段色条表示职责构成；下方标出每段的关键动作时刻。来源是这份模拟的代表迭代。</span>
      </div>
      <div className="simtl-events" role="list" aria-label={`${timeline.label} 关键动作时刻`}>
        {timeline.phases.map((phase) => (
          <div className="simtl-event-phase" role="listitem" key={phase.index}>
            <b>{phase.index}</b>
            <span>
              {phase.byAction
                .filter((action, index, all) => index === 0 || action.t - all[index - 1].t >= 1)
                .map((action) => (
                  <i className={`simtl-event ${ROLE_OF[action.name]}`} key={`${action.t}-${action.name}`} title={`${action.t.toFixed(1)}s · ${action.name}`}>
                    {action.t.toFixed(0)}s
                  </i>
                ))}
            </span>
          </div>
        ))}
      </div>
      <p className="simtl-read">{timeline.decision}</p>
      <p className="note">{timeline.evidence} 这是模拟执行节奏，不是真人日志阶段。</p>
      <details className="pm-raw">
        <summary>来源记录</summary>
        <div className="note">{timeline.runId}</div>
      </details>
    </div>
  );
}
