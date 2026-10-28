import React, { useMemo, useState } from 'react';
import { INTERACTIONS, LEVERAGE, SHARE, shareFor, skillName } from '../data/content';

const zh = (id: string) => {
  const n = INTERACTIONS.nodes.find((x) => x.id === id);
  return (n?.zh as string | null) ?? skillName(id).text ?? id;
};

/* ---------------- 杠杆：禁用某技能后掉多少 ---------------- */
export function LeverageChart({ hero }: { hero: string }) {
  const [scenarioId, setScenarioId] = useState(LEVERAGE.scenarios[0]?.id ?? 'st300');
  const rows = useMemo(
    () => LEVERAGE.rows.filter((r) => r.scenarioId === scenarioId).slice().sort((a, b) => a.deltaPct - b.deltaPct),
    [scenarioId],
  );
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.deltaPct)), 1);
  const baseline = LEVERAGE.baseline[scenarioId];

  /** 三态：显著 / 在误差内 / 未生效（没点这个天赋，或条件永不成立） */
  const stateOf = (r: (typeof rows)[number], share: ReturnType<typeof shareFor>) => {
    const dmg = share?.damage ?? 0;
    // 先判"本配置里根本没这个技能"，再判显著性
    if (dmg === 0 && Math.abs(r.deltaPct) < 1) return { key: 'unused', label: '未生效' };
    if (!r.beyondCi) return { key: 'flat', label: '在误差内' };
    return { key: 'real', label: '显著' };
  };

  return (
    <div className="card">
      <div className="hd">
        杠杆：禁用一个技能之后掉多少
        <span className="sec-tag">{hero === LEVERAGE.hero ? '执政官' : LEVERAGE.hero} · {LEVERAGE.iterations} 迭代</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {LEVERAGE.scenarios.map((s) => (
            <button key={s.id} className={`mini${scenarioId === s.id ? ' on' : ''}`} onClick={() => setScenarioId(s.id)}>
              {s.label}
            </button>
          ))}
        </span>
      </div>
      <div className="bd">
        <table className="tbl lev tbl-lev">
          <thead>
            <tr>
              <th style={{ width: 96 }}>技能</th>
              <th>损失（条越长越关键）</th>
              <th style={{ width: 68 }} className="n">ΔDPS%</th>
              <th style={{ width: 58 }}>状态</th>
              <th style={{ width: 64 }} className="n">伤害占比</th>
              <th style={{ width: 62 }} className="n">命中/跳</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const share = shareFor(r.skill, scenarioId);
              const st = stateOf(r, share);
              const loss = Math.max(0, -r.deltaPct);
              const w = (loss / maxAbs) * 100;
              return (
                <tr key={r.skill} className={st.key === 'flat' ? 'lev-flat' : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>{zh(r.skill)}</td>
                  <td>
                    <span className="levtrack">
                      <i className={st.key} style={{ width: `${w}%` }} />
                      {r.deltaCiPct ? (
                        <b style={{ left: `${Math.max(0, w - (r.deltaCiPct / maxAbs) * 100)}%`, width: `${(r.deltaCiPct / maxAbs) * 200}%` }} />
                      ) : null}
                    </span>
                  </td>
                  <td className="n mono">{r.deltaPct.toFixed(2)}%</td>
                  <td>
                    <span className={`state ${st.key}`}>{st.label}</span>
                  </td>
                  <td className="n dim">
                    {!share || (share.damage ?? 0) === 0 ? '无直接伤害' : `${share.sharePct.toFixed(1)}%`}
                  </td>
                  <td className="n dim">
                    {!share || (share.damage ?? 0) === 0 ? '—' : (share.executes ?? 0).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="note" style={{ marginTop: 8 }}>
          基线 DPS {Math.round(baseline?.mean ?? 0).toLocaleString()}（±{baseline?.ci95Pct ?? '—'}%）。
          读法：把这个技能从 APL 里注释掉、其他照常打，DPS 的变化；误差带 = 两边的 95% CI 之和。
        </div>
        <div className="note" style={{ marginTop: 4 }}>
          三种状态：<b>显著</b>=差异超过误差带；<b>在误差内</b>=分不清有没有影响；<b>未生效</b>=这个天赋没点/条件永不成立（伤害为 0 且差异 &lt;1%）。
          「无直接伤害」的是增益类技能（如虚空形态、能量灌注），它们不产生伤害行，但禁掉照样掉 DPS。
          另外：统计显著 ≠ 实战关键——−0.23%（暗言术：灭）虽然超出误差带，但量级可以忽略。
        </div>
      </div>
    </div>
  );
}

/* ---------------- 联动图 ---------------- */
const JUNK = new Set([
  'fade', 'shadowform', 'variable', 'arcane_torrent', 'angelic_feather', 'mind_soothe', 'dispersion',
  'fireblood', 'berserking', 'blood_fury', 'ancestral_call', 'invoke_external_buff', 'potion', 'use_item',
]);

const CN_LABEL: Record<string, string> = {
  mind_devourer: '心灵吞噬者（触发）',
  entropic_rift: '熵能裂隙',
  resonant_energy: '共振能量',
  crushing_void: '碎虚',
  void_apparitions: '虚空幻灵',
  voidform: '虚空形态',
  shadowy_apparition: '暗影幻灵（被动）',
  resonant_energy_damage: '共振能量（增伤）',
  mind_flay_insanity: '精神鞭笞：狂',
};

export function InteractionGraph({ hero }: { hero: string }) {
  const nodes = INTERACTIONS.nodes;
  const edges = INTERACTIONS.edges;

  const { pos, W, H, skillList, sourceList } = useMemo(() => {
    const sources = nodes
      .filter((n) => (n.kind === 'dot' || n.kind === 'buff') && n.id !== 'voidform')
      .filter((n) => edges.some((e) => e.to === n.id && e.kind !== 'cast_in_burst'))
      .slice(0, 8);

    const burstWeight = new Map<string, number>();
    for (const e of edges) if (e.kind === 'cast_in_burst') burstWeight.set(e.from, e.weight ?? 0);

    const skills = nodes
      .filter((n) => n.kind === 'skill' && !JUNK.has(n.id) && n.id !== 'voidform')
      .filter((n) => (burstWeight.get(n.id) ?? 0) >= 0.2 || edges.some((e) => e.from === n.id && (e.kind === 'requires_dot' || e.kind === 'requires_buff' || e.kind === 'procs_on')))
      .map((n) => ({ ...n, burst: burstWeight.get(n.id) ?? 0 }))
      .sort((a, b) => b.burst - a.burst)
      .slice(0, 10);

    const p = new Map<string, { x: number; y: number }>();
    const y0 = 74;
    sources.forEach((n, i) => p.set(n.id, { x: 118, y: y0 + i * 54 }));
    skills.forEach((n, i) => p.set(n.id, { x: 452, y: y0 + i * 50 }));
    p.set('voidform', { x: 800, y: y0 + ((skills.length - 1) * 50) / 2 });
    const height = Math.max(60 + sources.length * 54, y0 + skills.length * 50 + 30);
    return { pos: p, W: 900, H: height, skillList: skills, sourceList: sources };
  }, [nodes, edges]);

  const depEdges = edges.filter(
    (e) => ['requires_dot', 'requires_buff', 'procs_on'].includes(e.kind) && pos.has(e.from) && pos.has(e.to),
  );
  const burstEdges = edges
    .filter((e) => e.kind === 'cast_in_burst' && pos.has(e.from) && (e.weight ?? 0) >= 0.2)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 8);
  const openerEdges = edges.filter((e) => e.kind === 'opener_before_burst' && pos.has(e.from)).slice(0, 5);

  const strokeOf = (k: string) =>
    k === 'requires_dot' ? 'var(--dep-dot)' : k === 'requires_buff' || k === 'procs_on' ? 'var(--dep-buff)' : 'var(--dep-burst)';

  const labelOf = (id: string) => CN_LABEL[id] ?? nodes.find((n) => n.id === id)?.zh ?? skillName(id).text ?? id;

  return (
    <div className="card">
      <div className="hd" data-hero={hero}>
        联动：谁依赖谁、谁在爆发里
        <span className="sec-tag">APL 依赖 {INTERACTIONS.counts.apl} 条 · 爆发内占比来自日志</span>
      </div>
      <div className="bd">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="技能与 DoT、Buff 的联动关系">
          <defs>
            <marker id="arw" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--down)" />
            </marker>
          </defs>

          {/* 列标题 */}
          <text x={118} y={26} textAnchor="middle" fontSize={11} fill="var(--muted)">DoT / Buff 来源</text>
          <text x={452} y={26} textAnchor="middle" fontSize={11} fill="var(--muted)">技能（括号＝该技能施法落在爆发窗口内的比例）</text>
          <text x={800} y={26} textAnchor="middle" fontSize={11} fill="var(--muted)">爆发窗口</text>

          {/* 依赖边：技能 → 来源（左向） */}
          {depEdges.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            const x1 = a.x - 74, x2 = b.x + 76;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={`d-${e.from}-${e.to}-${i}`}
                d={`M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${x2} ${b.y}`}
                stroke={strokeOf(e.kind)} strokeWidth={1.1} fill="none" opacity={0.45}
              >
                <title>{`${labelOf(e.from)} 需要 ${labelOf(e.to)}${e.evidence?.line ? `\nAPL: ${e.evidence.line}` : ''}`}</title>
              </path>
            );
          })}

          {/* 爆发内占比：技能 → 虚空形态（线宽编码） */}
          {burstEdges.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get('voidform')!;
            const w = e.weight ?? 0;
            const x1 = a.x + 74, mx = (x1 + b.x - 54) / 2;
            return (
              <path
                key={`b-${e.from}-${i}`}
                d={`M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x - 54} ${b.y}`}
                stroke="var(--dep-burst)" strokeWidth={0.8 + w * 4} fill="none" opacity={0.25 + w * 0.55}
                markerEnd="url(#arw)"
              >
                <title>{`${labelOf(e.from)}：${Math.round(w * 100)}% 的施法在爆发窗口内`}</title>
              </path>
            );
          })}

          {/* 起手：虚线 */}
          {openerEdges.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get('voidform')!;
            return (
              <path
                key={`o-${e.from}-${i}`}
                d={`M ${a.x + 74} ${a.y + 6} C ${a.x + 160} ${a.y + 26}, ${b.x - 120} ${b.y + 20}, ${b.x - 56} ${b.y + 10}`}
                stroke="var(--dep-opener)" strokeWidth={1.6} strokeDasharray="5 4" fill="none" opacity={0.9}
              >
                <title>{`${labelOf(e.from)}：${e.label}`}</title>
              </path>
            );
          })}

          {/* 节点 */}
          {[...pos.entries()].map(([id, p]) => {
            const n = nodes.find((x) => x.id === id);
            const isVf = id === 'voidform';
            const label = labelOf(id);
            const burst = edges.find((e) => e.from === id && e.kind === 'cast_in_burst')?.weight;
            const text = burst && !isVf && n?.kind === 'skill' ? `${label}（${Math.round(burst * 100)}%）` : label;
            const wpx = Math.min(200, 26 + text.length * 12);
            const fill = n?.kind === 'dot' ? 'var(--dep-node-dot)' : n?.kind === 'buff' ? 'var(--dep-node-buff)' : isVf ? 'var(--dep-node-vf)' : 'var(--dep-node-skill)';
            const stroke = n?.kind === 'dot' ? 'var(--dep-dot)' : n?.kind === 'buff' ? 'var(--dep-buff)' : isVf ? 'var(--dep-burst)' : 'var(--dep-node-stroke)';
            return (
              <g key={id}>
                <rect x={p.x - wpx / 2} y={p.y - 14} width={wpx} height={28} rx={14} fill={fill} stroke={stroke} strokeWidth={1.2} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11.5} fill="var(--dep-label)">{text}</text>
              </g>
            );
          })}
        </svg>
        <div className="legend" style={{ marginTop: 6 }}>
          <span><i style={{ background: 'var(--dep-dot)' }} />依赖 DoT</span>
          <span><i style={{ background: 'var(--dep-buff)' }} />依赖 Buff / 等触发</span>
          <span><i style={{ background: 'var(--dep-burst)' }} />爆发内占比：细线≈20%，粗线≈80%，箭头指向爆发</span>
          <span><i style={{ background: 'var(--dep-opener)' }} />爆发起手（虚线）</span>
        </div>
        <div className="note" style={{ marginTop: 8 }}>
          中列只保留「有 DoT/Buff 依赖」或「爆发内占比 ≥20%」的技能，最多 10 个；括号里的百分比＝该技能施法落在虚空形态窗口内的比例。
          悬停连线看依据：左半边来自 APL 条件，右半边来自日志统计。
        </div>
      </div>
    </div>
  );
}

/* ---------------- 伤害占比（基线画像） ---------------- */
export function ShareTable({ hero }: { hero: string }) {
  const [scenarioId, setScenarioId] = useState(Object.keys(SHARE.scenarios)[0]);
  const sc = SHARE.scenarios[scenarioId];
  const rows = sc?.rows.slice(0, 14) ?? [];
  const max = Math.max(...rows.map((r) => r.sharePct), 1);
  return (
    <div className="card">
      <div className="hd" data-hero={hero}>
        基线伤害构成
        <span className="sec-tag">一次模拟 · {SHARE.iterations} 迭代</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {Object.entries(SHARE.scenarios).map(([id, s]) => (
            <button key={id} className={`mini${scenarioId === id ? ' on' : ''}`} onClick={() => setScenarioId(id)}>
              {s.label}
            </button>
          ))}
        </span>
      </div>
      <div className="bd">
        <div className="bars">
          {rows.map((r) => (
            <div className="brow" key={r.spell} style={{ gridTemplateColumns: '132px 1fr 96px' }}>
              <span>{skillName(r.spell).text ?? r.spellName ?? r.spell}</span>
              <span className="tr">
                <i className="on" style={{ width: `${(r.sharePct / max) * 100}%` }} />
              </span>
              <span className="num">{r.sharePct.toFixed(1)}% · {(r.executes ?? 0).toLocaleString()} 次</span>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: 8 }}>
          DPS {Math.round(sc?.dps ?? 0).toLocaleString()}。这张表回答“伤害从哪来”，杠杆表回答“少它会掉多少”——两者不是同一件事。
        </div>
      </div>
    </div>
  );
}
