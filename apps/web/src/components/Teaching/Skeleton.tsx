import React from 'react';

/**
 * 灰模组件库：空态"给形状不给形容词"。
 *
 * 原来只写在噬灭骨架页里（一次性手写），现在抽出来复用：
 * 未实装专精的骨架页、缺数据的章节段落，都用同一套形状。
 */

export interface PipelineStep {
  key: string;
  label: string;
  sub: string;
  ready: boolean;
  status: string;
}

/** ① 数据流水线：一眼看出哪一步已经有、哪一步还缺 */
export function Pipeline({ steps }: { steps: PipelineStep[] }) {
  const W = 900;
  const gap = 12;
  const n = steps.length;
  const boxW = (W - gap * (n - 1)) / n;
  return (
    <svg viewBox={`0 0 ${W} 122`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="数据接入流程：配置 → 模拟 → 分析 → 章节稿 → 页面">
      <defs>
        <marker id="pl-arw" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--skel-base)" />
        </marker>
      </defs>
      {steps.map((p, i) => {
        const x = i * (boxW + gap);
        return (
          <g key={p.key}>
            <rect
              x={x}
              y={14}
              width={boxW}
              height={64}
              rx={12}
              fill={p.ready ? 'rgba(74,222,128,0.10)' : 'var(--card-2)'}
              stroke={p.ready ? 'var(--up)' : 'var(--track)'}
              strokeWidth={1.2}
            />
            <text x={x + boxW / 2} y={40} textAnchor="middle" fontSize={12} fontWeight={700} fill={p.ready ? 'var(--curve-up-soft)' : 'var(--sub)'}>
              {p.label}
            </text>
            <text x={x + boxW / 2} y={58} textAnchor="middle" fontSize={11} fill="var(--curve-down-soft)">
              {p.sub}
            </text>
            <text x={x + boxW / 2} y={96} textAnchor="middle" fontSize={11} fill={p.ready ? 'var(--up)' : 'var(--muted)'}>
              {p.ready ? '●' : '○'} {p.status}
            </text>
            {i < n - 1 ? (
              <path d={`M ${x + boxW + 1} 46 L ${x + boxW + gap - 1} 46`} stroke="var(--data-unused)" strokeWidth={1.4} markerEnd="url(#pl-arw)" />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** ② 章节页灰模：让人看到"五段"是什么形状 */
export function ChapterWireframe() {
  const rows = [
    ['① 这一波几只', 62],
    ['② 开爆发值多少', 96],
    ['③ 技能怎么改', 74],
    ['④ 落在哪一波', 58],
    ['⑤ 真人怎么打', 80],
  ] as const;
  return (
    <div className="wire">
      <div className="wire-hd">章节页 · 五段固定</div>
      {rows.map(([label, w]) => (
        <div className="wire-row" key={label}>
          <span>{label}</span>
          <i style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

/** ③ 波次表灰模：14 根柱子 + 建议图例 */
export function WaveWireframe() {
  const bars = [13, 6, 9, 9, 5, 2, 1, 7, 10, 11, 10, 11, 7, 7];
  const max = Math.max(...bars);
  return (
    <div className="wire">
      <div className="wire-hd">副本页 · 逐波建议</div>
      <div className="wire-pulls">
        {bars.map((b, i) => (
          <i key={i} className={b === 1 ? 'boss' : b <= 4 ? 'small' : ''} style={{ height: `${(b / max) * 100}%` }} />
        ))}
      </div>
      <div className="wire-legend">
        <span><i className="dot-g" />开</span>
        <span><i className="dot-y" />看冷却</span>
        <span><i className="dot-m" />不开</span>
      </div>
    </div>
  );
}

/** ④ 杠杆图灰模 */
export function LeverageWireframe() {
  const rows = [
    ['技能 A', 92],
    ['技能 B', 74],
    ['技能 C', 58],
    ['技能 D', 41],
    ['技能 E', 22],
    ['技能 F', 6],
  ] as const;
  return (
    <div className="wire">
      <div className="wire-hd">解析台 · 杠杆</div>
      {rows.map(([name, w]) => (
        <div className="wire-lev" key={name}>
          <span>{name}</span>
          <i style={{ width: `${w}%` }} />
          <b>{w}%</b>
        </div>
      ))}
    </div>
  );
}

/** 图 + 一句说明，三张灰模的统一外壳 */
export function WireCard({ children, cap }: { children: React.ReactNode; cap: React.ReactNode }) {
  return (
    <div className="wirebox">
      {children}
      <p className="wire-cap">{cap}</p>
    </div>
  );
}
