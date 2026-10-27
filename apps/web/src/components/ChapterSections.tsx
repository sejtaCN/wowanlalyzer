import React, { useState } from 'react';
import type { CaseBlock, Chapter, EvidenceRef, MapRef, PriorityShift, WaveModelCard } from '@learn';
import { ALTAR_WAVES, CHAPTERS, FIGURES, budgetFor, burstPairs, getLog, getPhases, getRun, prioritySections, skillName, skillUsage, type BurstPair } from '../data/content';
import { Gloss } from './Gloss';
import TopBand from './Teaching/TopBand';
import WaveDiagram from './Teaching/WaveDiagram';
import BurstTimeline from './Teaching/BurstTimeline';
import { burstAdvice, burstValueFor } from './Teaching/rules';
import DecisionFlow from './Teaching/DecisionFlow';
import TargetBand from './Teaching/TargetBand';
import PriorityMap from './Teaching/PriorityMap';
import { RouteExplorer, SelectedWavePanel } from './Teaching/RouteExplorer';
import ActionBudget from './Teaching/ActionBudget';
import CooldownWindow from './Teaching/CooldownWindow';
import CastChart from './Teaching/CastChart';

/** 段外壳：编号 + 一句话（这一段回答什么）→ 图 → 一句说明 */
export function Section({
  no,
  question,
  tag,
  note,
  figureKind,
  figureStatus = 'ready',
  children,
}: {
  no?: string;
  question: string;
  tag?: React.ReactNode;
  note?: React.ReactNode;
  figureKind?: string;
  figureStatus?: 'ready' | 'missing' | 'not-applicable';
  children: React.ReactNode;
}) {
  return (
    <section
      className="sec"
      data-figure-section={no}
      data-figure-kind={figureKind}
      data-figure-status={figureStatus}
    >
      <div className="sec-hd">
        {no ? <span className="sec-no">{no}</span> : null}
        <h2>{question}</h2>
        {tag ? <span className="sec-tag">{tag}</span> : null}
      </div>
      <div className="sec-fig">{children}</div>
      {note ? <p className="sec-note">{note}</p> : null}
    </section>
  );
}


/* ① 模型卡：四个数值 + 一句结论 */
export function ModelCard({ model, claim }: { model: WaveModelCard | null; claim: string }) {
  if (!model) {
    return (
    <div className="scope-figure" data-figure-kind="scope">
      <span className="scope-mark">L0</span>
      <div><b>所有波次共用的规则</b><p>这一页不绑定目标数或副本；具体波次的判断放到 L1 / L2。</p></div>
    </div>
  );
  }
  return (
    <>
      <div className="model-grid">
        <div>
          <div className="k">目标数</div>
          <div className="v">{model.targets}</div>
        </div>
        <div>
          <div className="k">存活时长（假设）</div>
          <div className="v">{model.durationSec}s</div>
        </div>
        <div>
          <div className="k">移动 / 打断</div>
          <div className="v">{model.movement}</div>
        </div>
        <div>
          <div className="k">危险点</div>
          <div className="v">{model.dangers}</div>
        </div>
      </div>
      <div className="claim"><Gloss text={claim} /></div>
      {model.frequency ? <div className="note" style={{ marginTop: 6 }}>路线实测：{model.frequency}</div> : null}
    </>
  );
}

/* ② 主图：开爆发 vs 不开 —— 每个场景两行，各带真实 DPS，避免"绿色是增量还是全长"的歧义 */
export function BurstChart({ runIds, title, showScale = false }: { runIds: string[]; title: string; showScale?: boolean }) {
  const pairs: BurstPair[] = burstPairs(runIds);
  if (!pairs.length) return <div className="empty">这组 runId 里没有可配对的「开 / 不开」模拟，图不出。</div>;
  const maxOn = Math.max(...pairs.map((p) => p.on.dps));
  const pct = (v: number) => `${(v / maxOn) * 100}%`;
  const ordered = pairs
    .map((p) => ({ targets: Number(p.label.match(/\d+/)?.[0] ?? 0), damage: p.deltaDamage }))
    .filter((x) => x.targets > 0)
    .sort((a, b) => a.targets - b.targets);
  const scale = ordered.slice(1).map((x, i) => ({
    from: ordered[i].targets,
    to: x.targets,
    perTarget: (x.damage - ordered[i].damage) / (x.targets - ordered[i].targets),
  }));
  return (
    <>
      <h3>{title}</h3>
      <div className="bars">
        {pairs.map((p) => (
          <div className="grp" key={p.on.runId}>
            <div className="glabel">
              <span>{p.label}</span>
              <span className="gdelta">
                +{p.deltaPct.toFixed(1)}% · {(p.deltaDamage / 1e6).toFixed(1)}M
              </span>
            </div>
            <div className="brow">
              <span className="tag on">开爆发</span>
              <span className="tr">
                <i className="on" style={{ width: pct(p.on.dps) }} />
              </span>
              <span className="num">{Math.round(p.on.dps).toLocaleString()}</span>
            </div>
            <div className="brow">
              <span className="tag off">不开</span>
              <span className="tr">
                <i className="off" style={{ width: pct(p.off.dps) }} />
              </span>
              <span className="num">{Math.round(p.off.dps).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--up)' }} />开爆发 DPS</span>
        <span><i style={{ background: 'var(--data-off)' }} />不开 DPS</span>
        <span>±{(pairs[0]?.ciPct ?? 0).toFixed(2)}% (95% CI, n={pairs[0]?.on.samples ?? '—'})</span>
      </div>
      {showScale && scale.length ? (
        <p className="note">
          目标放大：{scale.map((s) => `${s.from}→${s.to} 只，每多 1 只单次爆发 ${s.perTarget >= 0 ? '+' : ''}${(s.perTarget / 1e6).toFixed(2)}M`).join('；')}。这是同一次爆发的增量，不是 DPS 总量。
        </p>
      ) : null}
    </>
  );
}

/* ②b 主图：优先级表（L0 用） */
export function PriorityTableChart({ filter }: { filter?: { sections?: string[] } }) {
  const sections = prioritySections(filter?.sections);
  if (!sections.length) return <div className="empty">没有优先级数据。</div>;
  return (
    <>
      {sections.map((sec) => (
        <div key={sec.key} style={{ marginBottom: 16 }}>
          <h3 style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            {sec.label}
            <span className="note">{sec.rows.length} 条</span>
          </h3>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th style={{ width: 150 }}>技能</th>
                <th>条件（什么时候用它）</th>
                <th style={{ width: 210 }}>选目标</th>
              </tr>
            </thead>
            <tbody>
              {sec.rows.map((r) => {
                const s = skillName(r.skill);
                return (
                  <tr key={`${sec.key}-${r.order}-${r.skill}`}>
                    <td className="n dim">{r.order}</td>
                    <td title={r.skill}>{s.text}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.conditionGroups?.length ? (
                        <div className="cond-groups">
                          {r.conditionGroups.map((g, gi) => (
                            <div className="cond-line" key={gi}>
                              {gi > 0 ? <span className="cond-or">或</span> : null}
                              <span>{g}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="dim">{r.conditionZh || '无条件（按顺序直接用）'}</span>
                      )}
                    </td>
                    <td className="dim" style={{ fontSize: 12 }}>{r.targetSelectZh || '当前目标'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <div className="note">表格顺序来自 APL 原文。条件翻成了人话，逻辑一个字没改。</div>
    </>
  );
}

/* ②c 主图：技能卡（L0 技能清单） */
export function SkillCards() {
  const usage = skillUsage();
  if (!usage.length) return <div className="empty">没有技能数据。</div>;
  return (
    <>
      <div className="skills">
        {usage.map((u) => {
          const s = skillName(u.skill);
          return (
            <div className="sk" key={u.skill}>
              <div className="nm" title={u.skill}>
                {s.text}
              </div>
              <div className="meta">
                <span className="cnt">{u.count} 条规则</span>
                <span className="dim">{u.sections.join(' · ')}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        {usage.length} 个技能，共 {usage.reduce((n, u) => n + u.count, 0)} 条优先级规则。
        按出现次数排：次数越多，出现的场合越多，先认它。
      </div>
    </>
  );
}

/* ②d 主图：真实日志统计 */
export function LogStats({ logId }: { logId: string }) {
  const log = getLog(logId);
  if (!log) return <div className="empty">找不到日志 {logId}。</div>;
  const seg = log.segments[0];
  const windows = seg.burstWindows.filter((w) => w.buff === 'Voidform');
  const dots = Object.entries(seg.dotUptime);
  return (
    <>
      <div className="kpis">
        <div><div className="k">施法</div><div className="v">{seg.casts.toLocaleString()}<small> 次</small></div></div>
        <div><div className="k">每分钟施法</div><div className="v">{seg.castsPerMinute}<small> 次</small></div></div>
        <div><div className="k">GCD 中位</div><div className="v">{seg.gcdMedian}<small> 秒</small></div></div>
        <div><div className="k">爆发窗口</div><div className="v">{windows.length}<small> 次</small></div></div>
      </div>
      <h3 style={{ marginTop: 14 }}>持续伤害平均覆盖几个目标<span className="note" style={{ fontWeight: 400, marginLeft: 8 }}>灰线 = 5 个目标</span></h3>
      <div className="bars">
        {dots
          .slice()
          .sort((a, b) => b[1].avgTargetsCovered - a[1].avgTargetsCovered)
          .map(([name, v]) => (
            <div className="brow" key={name} style={{ gridTemplateColumns: '104px 1fr 64px' }}>
              <span>{name}</span>
              <span className="tr">
                <i className="on" style={{ width: `${Math.min(100, (v.avgTargetsCovered / 5) * 100)}%` }} />
                <i className="ref" style={{ left: '100%' }} />
              </span>
              <span className="num">{v.avgTargetsCovered} 个</span>
            </div>
          ))}
      </div>
      <div className="note" style={{ marginTop: 8 }}>
        {log.label} · {log.sourceNote}。这是<b>整场统计</b>，不是某一波——日志里没有战斗分段。
      </div>
    </>
  );
}

/* ②e 主图：整条路线的波次表（L2 用） */

/** 兼容旧导出；新页面直接传 readRun，缺 runId 时显示待补而不是 0。 */
export { burstAdvice } from './Teaching/rules';

export function WaveTable() {
  const waves = ALTAR_WAVES.waves;
  const values = waves.map((w) => burstValueFor(w.mobCount, w.isBoss, getRun).deltaDamage ?? 0);
  const maxV = Math.max(...values, 1);
  return (
    <>
      <table className="tbl">
        <thead>
          <tr><th>波</th><th>怪数</th><th>类型</th><th>一次爆发增量</th><th>建议</th></tr>
        </thead>
        <tbody>
          {waves.map((w, i) => {
            const v = values[i];
            const adv = burstAdvice(w);
            const kind = w.isBoss ? 'BOSS' : w.mobCount >= 10 ? '大波' : w.mobCount >= 5 ? '中波' : '小波';
            return (
              <tr key={w.pull}>
                <td className="n dim">{w.pull}</td><td className="n">{w.mobCount}</td><td>{kind}</td>
                <td><span className="wave-value"><span className="tr"><i style={{ width: `${(v / maxV) * 100}%` }} /></span><b className="mono">{v.toFixed(2)}M</b></span></td>
                <td><span className={`adv ${adv.tone}`}>{adv.text}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="note">目标档与 BOSS 档分别读取对应 runId；超过 8 只按 8 只档。</div>
    </>
  );
}

/* ③ 技能调整 */
export function PriorityDiff({ add, drop, level }: { add: PriorityShift[]; drop: PriorityShift[]; level?: string }) {
  return <PriorityMap add={add} drop={drop} level={level} />;
}

/* ④ 路线与地图；没有坐标就不在地图上标点。 */
export function MapPanel({
  map,
  level,
  targets,
  kind,
  selectedPull,
}: {
  map: MapRef | null;
  level?: string;
  targets?: string | null;
  kind?: 'wave' | 'boss' | 'adds' | 'rhythm';
  selectedPull?: number;
}) {
  if (!map) {
    if (level === 'L0') {
      return <div className="figempty" data-figure-kind="scope">基础规则不绑定地图；具体路线放到 L2。</div>;
    }
    return <div className="figempty" data-figure-kind="missing">这一章讲通用模型，没有独立路线与地图。</div>;
  }
  const wave = ALTAR_WAVES.waves.find((w) => w.pull === (selectedPull ?? map.pull));
  return (
    <div className="mapgrid" data-figure-kind={level === 'L2' ? 'route-map' : 'route-examples'}>
      <div className="mapviz">
        <img
          className="mapimg"
          src="./maps/altar-of-fangs.webp"
          alt="Altar of Fangs 地牢平面图（keystone.guru 瓦片拼接）"
        />
        <div className="note" style={{ marginTop: 6 }}>
          {level === 'L2'
            ? 'keystone.guru 瓦片拼接（1536×1024）。路线没有每波坐标，所以这张图只给地形，不标位置。'
            : '这条路线只用来举例：它不证明通用模型绑定这一波。路线没有每波坐标，不往图上标位置。'}
        </div>
      </div>
      <div className="maptext">
        {level === 'L2' && wave ? (
          <>
            <div className="map-current">
              <span className="tb-k">当前选中</span>
              <b>第 {wave.pull} 波 · {wave.mobCount} 只 · {wave.isBoss ? 'BOSS' : wave.mobCount >= 10 ? '大波' : wave.mobCount >= 5 ? '中波' : '小波'}</b>
              <div className="map-mobs">
                {wave.mobs.map((m) => <span key={m.name}>{m.name} ×{m.count}</span>)}
              </div>
            </div>
            <p className="note">平面图只回答“整张地牢长什么样”；波次顺序看上面的路线条。</p>
          </>
        ) : (
          <WaveDiagram targets={targets ?? null} highlightPull={selectedPull ?? map.pull} kind={kind} />
        )}
        <p className="note">路线来源：<a href={ALTAR_WAVES.sourceUrl} target="_blank" rel="noreferrer">keystone.guru · {ALTAR_WAVES.route}</a></p>
      </div>
    </div>
  );
}

/* ⑤ 高手对照 */
export function CasePanel({ block, timeline }: { block: CaseBlock; timeline?: React.ReactNode }) {
  if (block.status === 'pending') {
    return <div className="figempty" data-figure-kind="missing">待补：{block.reason}</div>;
  }
  if (block.status === 'phases') {
    const doc = getPhases(block.logId);
    if (!doc) return <div className="casebox">找不到阶段数据（{block.logId}）。</div>;
    const hi = new Set(block.highlight ?? []);
    const total = doc.phases.reduce((n, p) => n + p.bursts, 0);
    return (
      <>
        <div className="casebox" style={{ marginBottom: 10 }}>
          <b>{block.headline}</b>
          {block.reading ? <div style={{ marginTop: 4 }}>{block.reading}</div> : null}
        </div>
        {timeline}
        <details className="phase-details">
          <summary>展开 9 段阶段明细（时长 / 路线重合 / 爆发 / 施法）</summary>
          <div className="tblwrap">
          <table className="tbl tbl-ph">
            <thead>
              <tr>
                <th style={{ width: 24 }}>#</th>
                <th>阶段 · 时间 · 主要怪物</th>
                <th style={{ width: 56 }} className="n">时长(s)</th>
                <th style={{ width: 96 }} className="n">路线匹配</th>
                <th style={{ width: 56 }} className="n">爆发</th>
                <th style={{ width: 66 }} className="n">施法/分</th>
              </tr>
            </thead>
            <tbody>
              {doc.phases.map((p, i) => {
                const mark = hi.has(p.index);
                const mmss = (v: number) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(Math.round(v % 60)).padStart(2, '0')}`;
                const top = (doc.routeMatches?.[String(p.index)] ?? [])[0];
                const fams = p.families.slice(0, 2).map((f) => f.name).join(' · ');
                return (
                  <tr key={p.index} className={mark ? 'ph-mark' : i % 2 ? 'ph-alt' : undefined}>
                    <td className="n dim">{p.index}</td>
                    <td>
                      {mark ? <span className="ph-flag">★ 重点</span> : null}
                      <span style={mark ? { fontWeight: 600 } : undefined}>
                        {p.kind === 'boss' ? '★ ' : ''}
                        {p.label}
                      </span>
                      <small className="ph-time">
                        {mmss(p.from)}–{mmss(p.to)} · {fams || '—'}
                      </small>
                    </td>
                    <td className="n">{p.durationSec}s</td>
                    <td className="n mono dim" style={{ whiteSpace: 'nowrap' }}>
                      {top ? `≈第${top.pull}波 · ${Math.round(top.jaccard * 100)}%` : '—'}
                    </td>
                    <td className="n" style={p.bursts === 0 ? { color: 'var(--muted)' } : { fontWeight: 600 }}>
                      {p.bursts}
                    </td>
                    <td className="n dim">{p.castsPerMinute}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </details>
        <div className="note" style={{ marginTop: 8 }}>
          推断方法：{doc.method.summary}。全程 {Math.round(doc.totalSec)} 秒共 {total} 次爆发。
          标「重点」的行是这一章要读者看的阶段。
        </div>
        <div className="note" style={{ marginTop: 4 }}>
          「路线匹配」读法：`≈第N波 · X%` = 这一阶段的怪物组成与路线第 N 波的<b>重合度</b>（Jaccard），不是“打到第几波”。只列最高的一波；低于 40% 说明他走的是另一条顺序。
        </div>
        <div className="note" style={{ marginTop: 4, color: 'var(--ink-on-gold-soft)' }}>
          限制：{doc.limitation}
        </div>
      </>
    );
  }
  return (
    <>
      <CastChart logId={block.logId} />
      <div className="casebox">
        <b>{block.headline}</b>
        <ul>
          {block.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div className="note" style={{ marginTop: 8, color: 'var(--ink-on-gold-soft)' }}>{block.evidence}</div>
      </div>
    </>
  );
}

/* 证据条 */
export function EvidenceBar({ evidence }: { evidence: EvidenceRef }) {
  const commits = [...new Set(evidence.runIds.map((id) => id.split('__')[0]))];
  return (
    <div className="evidence">
      <span>
        <b>模拟</b>{' '}
        {evidence.runIds.length ? `${evidence.runIds.length} 个 runId · ${evidence.runIds.slice(0, 2).join(' · ')}` : '这一页不引用模拟'}
      </span>
      {evidence.logs?.length ? <span><b>日志</b> {evidence.logs.join(' · ')}（整场，无分段）</span> : null}
      <span><b>来源</b> {evidence.sources.join(' · ')}</span>
      <span><b>日期</b> {evidence.generatedAt.slice(0, 10)}</span>
      {commits.length ? <span><b>组</b> {commits.join(' / ')}</span> : null}
    </div>
  );
}

/* 章节页组装：顶图带 + 五段固定顺序（每段：编号 + 一句话 → 图 → 一句说明） */
export function ChapterBody({ chapter }: { chapter: Chapter }) {
  const model = chapter.model;
  const figures = FIGURES[chapter.id] ?? [];
  const figure = (n: number) => figures[n - 1];
  const isRoute = chapter.level === 'L2';
  const isRhythm = model?.kind === 'rhythm';
  const [selectedPull, setSelectedPull] = useState<number>(chapter.map?.pull ?? ALTAR_WAVES.waves[0]?.pull ?? 1);
  const routeWave = isRoute ? ALTAR_WAVES.waves.find((w) => w.pull === selectedPull) ?? null : null;
  const routeGuide = isRoute && routeWave
    ? CHAPTERS.find((c) => c.id === (routeWave.isBoss ? 'l1-04-boss' : routeWave.mobCount >= 10 ? 'l1-02-large' : routeWave.mobCount >= 5 ? 'l1-01-mid' : 'l1-03-small')) ?? null
    : null;
  const budget = budgetFor(chapter.budgetScenario);
  const pairs = chapter.chart.kind === 'burst-bars' ? burstPairs(chapter.chart.runIds ?? []) : [];
  const top = pairs[0];

  return (
    <>
      <TopBand chapter={chapter} selectedPull={isRoute ? selectedPull : undefined} />

      <Section
        no="①"
        figureKind={isRoute ? figure(1)?.kind : isRhythm ? 'cooldown-window' : budget ? 'play-budget' : model ? 'target-band' : figure(1)?.kind}
        figureStatus={figure(1)?.status}
        question={isRoute ? '这条路线怎么分波' : isRhythm ? '两波之间，冷却够不够' : budget ? '这一档有多大，时间怎么花' : model ? '这一档在目标数轴上在哪' : '这一页讲什么'}
        tag={isRoute ? `${ALTAR_WAVES.pulls} 波` : model?.frequency ?? '全局'}
        note={
          isRoute
            ? '柱高就是这一波的实际怪数。点任意一波，上面的结论、下面的数值、地图注记会一起换。'
            : isRhythm
              ? '这是把模拟冷却、A/B 收益和日志节奏放在同一把秒尺上算出来的，不是两波连打的模拟。'
              : budget
                ? `目标：${budget.durationSec} 秒木桩，全程 uptime。移动 ${model?.movement}、危险点 ${model?.dangers} 个都还没折算成可用 GCD。`
                : model
                  ? `目标数轴只回答“够不够大”。${model.durationSec}s 是模型假设；移动 ${model.movement}、危险点 ${model.dangers} 个还没折算成 DPS 代价。`
                  : '范围卡只说明这套规则用在哪，不给波次参数。'
        }
      >
        {isRoute ? (
          <RouteExplorer selectedPull={selectedPull} onSelect={setSelectedPull} />
        ) : isRhythm ? (
          <CooldownWindow />
        ) : model ? (
          <>
            <TargetBand model={model} />
            {budget ? <ActionBudget data={budget} /> : null}
          </>
        ) : (
          <ModelCard model={null} claim={chapter.claim} />
        )}
      </Section>

      <Section
        no="②"
        figureKind={isRoute ? 'selected-wave' : chapter.chart.kind}
        figureStatus={figure(2)?.status}
        question={isRoute ? '选中的这一波值多少' : '开爆发值多少'}
        tag={isRoute ? '当前波 · 配对 runId' : chapter.chart.kind === 'burst-bars' ? '模拟 · 5000 迭代' : chapter.chart.kind}
        note={
          isRoute && routeWave
            ? routeWave.mobCount > 8
              ? `这一波 ${routeWave.mobCount} 只，模拟按 8 只档算，读作保守下限。够用来决定“开 / 看冷却 / 不开”。`
              : '两行各自是真实 DPS 和 95% CI。增量没有叠在原条上。'
            : top
              ? `开与不开差 ${top.deltaPct.toFixed(1)}%，一次爆发多换 ${(top.deltaDamage / 1e6).toFixed(1)}M。误差带 ±${top.ciPct.toFixed(2)}%，别把它当收益。`
              : chapter.chart.title
        }
      >
        {isRoute && routeWave ? (
          <SelectedWavePanel wave={routeWave} />
        ) : chapter.chart.kind === 'burst-bars' ? (
          <BurstChart runIds={chapter.chart.runIds ?? []} title={chapter.chart.title} showScale={chapter.id === 'l1-01-mid'} />
        ) : chapter.chart.kind === 'priority-table' ? (
          <PriorityTableChart filter={chapter.chart.filter} />
        ) : chapter.chart.kind === 'skill-cards' ? (
          <SkillCards />
        ) : chapter.chart.kind === 'log-stats' ? (
          <LogStats logId={chapter.chart.logId ?? ''} />
        ) : chapter.chart.kind === 'wave-table' ? (
          <WaveTable />
        ) : (
          <div className="figempty">这一章的图类型「{chapter.chart.kind}」还没有渲染器。</div>
        )}
      </Section>

      <Section
        no="③"
        figureKind={isRoute ? (routeGuide ? 'priority-map' : 'missing') : figure(3)?.kind}
        figureStatus={isRoute ? (routeGuide ? 'ready' : 'missing') : figure(3)?.status}
        question={chapter.level === 'L0' ? '循环里哪些地方容易读错' : '这一波技能顺序怎么改'}
        tag={isRoute ? '按目标档套用 L1' : '相对 L0 优先级表'}
        note={
          isRoute && routeGuide
            ? `当前第 ${routeWave?.pull} 波有 ${routeWave?.mobCount} 只，套用「${routeGuide.title}」的同档调整。这是规则映射，不是这一波专属数据。`
            : `这一波加 ${chapter.priorityDiff.add.length} 条、降 ${chapter.priorityDiff.drop.length} 条。序号是 APL 表里的真实位置，每条都挂着理由。`
        }
      >
        {isRoute && routeGuide ? (
          <PriorityDiff add={routeGuide.priorityDiff.add} drop={routeGuide.priorityDiff.drop} level="L2" />
        ) : (
          <PriorityDiff add={chapter.priorityDiff.add} drop={chapter.priorityDiff.drop} level={chapter.level} />
        )}
      </Section>

      <Section
        no="④"
        figureKind={figure(4)?.kind}
        figureStatus={figure(4)?.status}
        question={isRoute ? '这一波在地图哪里' : chapter.level === 'L0' ? '这套规则用在哪里' : '落到真实路线是什么样'}
        tag={chapter.map ? (isRoute ? '地形图 · 不标波次坐标' : '路线示例') : '不绑定地图'}
        note={
          isRoute
            ? '选波看第①段。这一段只核对地形：路线没有每波坐标，不给不存在的点位。'
            : chapter.map
              ? '借这条真实路线说明模型。路线没有每波坐标，不往图上标位置。'
              : '这一章不绑副本。套到具体路线看 L2。'
        }
      >
        <MapPanel map={chapter.map} level={chapter.level} targets={model?.targets} kind={model?.kind} selectedPull={isRoute ? selectedPull : undefined} />
      </Section>

      <Section
        no="⑤"
        figureKind={chapter.casePanel.status === 'log' ? 'cast-chart' : figure(5)?.kind}
        figureStatus={figure(5)?.status}
        question="真人怎么打"
        tag={chapter.casePanel.status === 'pending' ? '待补' : '真实日志'}
        note="整场日志推出的阶段，不是单波。这份导出没有死亡事件，切不出「第 N 波几时开始」。"
      >
        <CasePanel
          block={chapter.casePanel}
          timeline={
            chapter.casePanel.status === 'phases' ? (
              <BurstTimeline logId={chapter.casePanel.logId} highlight={chapter.casePanel.highlight} />
            ) : null
          }
        />
      </Section>

      <EvidenceBar evidence={chapter.evidence} />
    </>
  );
}
