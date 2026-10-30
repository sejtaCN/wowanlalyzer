import React from 'react';
import { getRun, type RouteDoc, type RouteWave } from '../../data/content';
import { burstValueFor, parseTargets } from './rules';

/**
 * WaveDiagram：这一波是几只怪、由哪几个怪物族组成。
 *
 * 数据只用 keystone 路线的波次构成（`content/routes/*.json`：每波的怪物族与数量）。
 * 不画位置：路线数据没有坐标，标位置就等于编数据。
 */

/** 同族同色：名称哈希到一组低饱和色，保证同一只怪在每张图里颜色一致 */
const FAMILY_COLORS = [
  'var(--family-1)',
  'var(--family-2)',
  'var(--family-3)',
  'var(--family-4)',
  'var(--family-5)',
  'var(--family-6)',
];
function familyColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 997;
  return FAMILY_COLORS[h % FAMILY_COLORS.length];
}

export interface WaveDiagramProps {
  /** 这一章绑定的路线；缺数据时传 null，图上直接说明缺什么 */
  route: RouteDoc | null;
  /** 章节模型卡里的目标数区间，如 "10–22" */
  targets: string | null;
  /** 要高亮的波次（章节地图里绑定的那一波） */
  highlightPull?: number;
  /** 最多显示几波，默认 3 */
  limit?: number;
  /** 普通档 / BOSS 档 / 两波节奏示例 */
  kind?: 'wave' | 'boss' | 'adds' | 'rhythm';
}

export default function WaveDiagram({ route, targets, highlightPull, limit = 3, kind = 'wave' }: WaveDiagramProps) {
  const range = parseTargets(targets);
  if (!route) {
    return <div className="figempty">缺这条副本的路线数据，波次构成暂时画不出来。</div>;
  }
  const allWaves = route.waves;
  let waves: RouteWave[];
  if (kind === 'boss') {
    waves = allWaves.filter((w) => w.isBoss);
  } else if (kind === 'rhythm') {
    const big = allWaves.find((w) => w.phase === 'inner-altar' && w.mobCount >= 10);
    const small = allWaves.find((w) => !w.isBoss && w.mobCount <= 4);
    waves = [big, small].filter(Boolean) as RouteWave[];
  } else {
    waves = allWaves.filter((w) => !w.isBoss && range && w.mobCount >= range[0] && w.mobCount <= range[1]);
  }

  if (!range && kind !== 'boss' && kind !== 'rhythm') {
    return <div className="figempty">这一章没有波次模型（讲的是全局规则），所以没有“这一波几只”的图。</div>;
  }
  if (!waves.length) {
    if (kind === 'rhythm') {
      return <div className="figempty">这条路线里没有同时出现大波和小波，不能硬凑两波示例。</div>;
    }
    return (
      <div className="figempty">
        这条路线里没有 {range ? `${range[0]}–${range[1]}` : kind} 只的波：这一档只在别的副本出现，模型仍然成立（模拟按目标数，不按地图）。
      </div>
    );
  }

  const shown = waves.slice(0, kind === 'rhythm' ? 2 : limit);
  const hidden = waves.length - shown.length;

  return (
    <div className={`wavediag${kind === 'rhythm' ? ' wd-rhythm' : ''}`}>
      {kind === 'rhythm' ? (
        <div className="note">
          这条路线没有相邻的大波→小波；下面只取一个大波和一个小波作档位示例（第 {shown[0]?.pull} 波、第 {shown[1]?.pull} 波），不证明顺序。
        </div>
      ) : null}
      {shown.map((w) => {
        const isHi = w.pull === highlightPull;
        return (
          <div className={`wd-row${isHi ? ' hi' : ''}`} key={w.pull}>
            <div className="wd-k">
              第 {w.pull} 波{w.isBoss ? ` · BOSS${w.encounter ? ` · ${w.encounter}` : ''}` : ''}
              <b>{w.mobCount} 只</b>
            </div>
            <div className="wd-mobs" aria-hidden={false}>
              {w.mobs.flatMap((m) =>
                Array.from({ length: m.count }, (_, i) => (
                  <span
                    key={`${m.name}-${i}`}
                    className="wd-mob"
                    style={{ background: familyColor(m.name) }}
                    title={m.name}
                  />
                )),
              )}
            </div>
            <div className="wd-v">
              按目标档模拟{' '}
              {(() => {
                const v = burstValueFor(w, getRun);
                return v.deltaDamage == null ? <b>不出差值</b> : <b>{(v.deltaDamage / 1e6).toFixed(1)}M</b>;
              })()}
            </div>
          </div>
        );
      })}
      <div className="wd-legend">
        <span><i className="wd-key" />一个方块 = 一只怪 · 同色 = 同一种怪</span>
        <span>数值 = 按当前波目标数匹配的模拟档位（&gt;8 只按 8 只计）。空波次、BOSS 混小怪都不套普通木桩。</span>
        {hidden > 0 ? <span>另有 {hidden} 波同档未显示</span> : null}
      </div>
      {shown.some((w) => w.mobs.length) ? (
        <div className="wd-fams">
          {shown[0].mobs.map((m) => (
            <span key={m.name} className="wd-fam">
              <i style={{ background: familyColor(m.name) }} />
              {m.name} ×{m.count}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
