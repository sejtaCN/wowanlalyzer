import React from 'react';
import { getLog, getPhases } from '../../data/content';

/**
 * BurstTimeline：一场战斗里，爆发窗口落在哪些阶段。
 *
 * 两条都是真实时间轴，同一把尺子（秒）：
 *   - 阶段带：`content/logs/<run>-phases.json`（推断出来的区域/BOSS 分段，有方法说明）
 *   - 爆发窗口：`content/logs/<run>-events.json` 里 Voidform 的真实起止时间
 * 不画"这一波何时开始"——日志没有死亡事件，切不出单波。
 */

const W = 660;
const H = 118;
const PAD = 8;

export default function BurstTimeline({ logId, highlight }: { logId: string; highlight?: number[] }) {
  const doc = getPhases(logId);
  const log = getLog('xiaohuasheng-events');
  if (!doc) return <div className="figempty">找不到阶段数据（{logId}）。</div>;

  const total = doc.totalSec || doc.phases[doc.phases.length - 1].to;
  const x = (t: number) => PAD + (Math.max(0, Math.min(t, total)) / total) * (W - PAD * 2);
  const windows = (log?.segments[0]?.burstWindows ?? []).filter((w) => w.buff === 'Voidform');
  const hi = new Set(highlight ?? []);
  const totalBursts = doc.phases.reduce((n, p) => n + p.bursts, 0);

  const mm = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  return (
    <div className="btl">
      <svg viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" role="img" aria-label="整场时间轴：9 个阶段 + 爆发窗口">
        {/* 阶段带 */}
        {doc.phases.map((p) => {
          const x0 = x(p.from);
          const w = Math.max(1, x(p.to) - x0 + 0.6); // +0.6 抹掉像素舍入留下的缝
          const mark = hi.has(p.index);
          return (
            <g key={p.index}>
              <rect
                x={x0}
                y={16}
                width={w}
                height={32}
                rx={0}
                fill={p.kind === 'boss' ? 'var(--data-boss)' : mark ? 'var(--track-2)' : 'var(--track-2)'}
                stroke={mark ? 'var(--gold)' : 'none'}
                strokeWidth={mark ? 1.4 : 0}
              >
                <title>{`第 ${p.index} 段 · ${p.label} · ${p.durationSec}s · 爆发 ${p.bursts} 次`}</title>
              </rect>
              {w > 54 ? (
                <text x={x0 + w / 2} y={36} textAnchor="middle" fontSize={9.5} fill={p.kind === 'boss' ? 'var(--ink-on-gold-soft)' : 'var(--curve-label)'}>
                  {p.kind === 'boss' ? '★ ' : ''}
                  {p.label}
                </text>
              ) : null}
              <text x={x0 + w / 2} y={12} textAnchor="middle" fontSize={9.5} fill={p.bursts === 0 ? 'var(--curve-down-soft)' : 'var(--gold)'} fontWeight={700}>
                {`×${p.bursts}`}
              </text>
            </g>
          );
        })}

        {/* 爆发窗口（真实起止） */}
        {windows.map((w, i) => (
          <rect
            key={i}
            x={x(w.start)}
            y={56}
            width={Math.max(2, x(w.end) - x(w.start))}
            height={16}
            rx={0}
            fill="var(--up)"
            opacity={0.75}
          >
            <title>{`爆发窗口 ${mm(w.start)}–${mm(w.end)}（${(w.end - w.start).toFixed(0)}s）`}</title>
          </rect>
        ))}

        {/* 轴：每 5 分钟一个刻度 */}
        <line x1={PAD} y1={80} x2={W - PAD} y2={80} stroke="var(--line-2)" strokeWidth={1} />
        {Array.from({ length: Math.floor(total / 300) + 1 }, (_, i) => i * 300).map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={80} x2={x(t)} y2={85} stroke="var(--line-2)" strokeWidth={1} />
            <text x={x(t)} y={96} fontSize={9} fill="var(--curve-down-soft)" textAnchor={t === 0 ? 'start' : 'middle'}>
              {Math.round(t / 60)}min
            </text>
          </g>
        ))}
        <text x={W - PAD} y={96} fontSize={9} fill="var(--curve-down-soft)" textAnchor="end">
          整场 {mm(total)}
        </text>
      </svg>

      <div className="btl-legend">
        <span><i style={{ background: 'var(--track-2)' }} />区域段</span>
        <span><i style={{ background: 'var(--data-boss)' }} />BOSS 段</span>
        <span><i style={{ background: 'var(--up)' }} />爆发窗口（真实起止）</span>
        <span>带上的 ×N = 这一段开了几次爆发，合计 {totalBursts} 次</span>
      </div>
    </div>
  );
}
