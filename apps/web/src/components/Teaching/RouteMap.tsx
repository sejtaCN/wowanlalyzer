import React, { useMemo, useState } from 'react';
import type { RouteDoc, RouteWave } from '../../data/content';
import { burstAdvice } from './rules';

const TYPE = (wave: RouteWave) =>
  wave.mobCount <= 0 ? '空波次' : wave.isBoss ? '首领波' : wave.mobCount >= 10 ? '大波' : wave.mobCount >= 5 ? '中波' : '小波';

function waveCenter(wave: RouteWave, scale: number) {
  const points = wave.enemyPositions ?? [];
  if (!points.length) return null;
  const lat = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return { x: lng * scale, y: -lat * scale };
}

export default function RouteMap({
  route,
  dungeon,
  mapScope,
  selectedPull,
  defaultPull,
  onSelect,
}: {
  route: RouteDoc;
  dungeon: string;
  mapScope?: string | null;
  selectedPull?: number;
  defaultPull?: number;
  onSelect?: (pull: number) => void;
}) {
  const [localPull, setLocalPull] = useState(
    selectedPull ?? defaultPull ?? route.waves.find((wave) => wave.mobCount > 0)?.pull ?? route.waves[0]?.pull ?? 1,
  );
  const currentPull = selectedPull ?? localPull;
  const current = route.waves.find((wave) => wave.pull === currentPull) ?? route.waves[0] ?? null;
  const projection = route.mapProjection;

  const geometry = useMemo(() => {
    if (!projection) return null;
    const scale = projection.pixelsPerWorldUnit;
    const paths = (route.routePaths ?? []).map((path) =>
      path.map((point) => `${point.lng * scale},${-point.lat * scale}`).join(' '),
    );
    const centers = route.waves.map((wave) => ({ wave, point: waveCenter(wave, scale) }));
    return { paths, centers };
  }, [projection, route.routePaths, route.waves]);

  if (!projection || !geometry?.paths.length) {
    return <div className="figempty">这条路线缺少可核验的地图坐标，不能拿波次数硬画路线。</div>;
  }

  const choose = (pull: number) => {
    setLocalPull(pull);
    onSelect?.(pull);
  };
  const image = `./maps/${dungeon.replace(/_/g, '-')}.webp`;
  const currentAdvice = current ? burstAdvice(current) : null;

  return (
    <div className="route-map">
      <div className="route-map-stage">
        <img
          className="mapimg"
          src={image}
          alt={`${route.dungeon} 地牢平面图${mapScope ? `（${mapScope}）` : ''}`}
        />
        <svg
          className="route-map-paths"
          viewBox={`0 0 ${projection.width} ${projection.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {geometry.paths.map((points, index) => (
            <polyline
              key={`${index}-${points.slice(0, 18)}`}
              points={points}
              className={index + 1 === currentPull ? 'route-line on' : 'route-line'}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {geometry.centers.map(({ wave, point }) => {
          if (!point || point.x < 0 || point.x > projection.width || point.y < 0 || point.y > projection.height) return null;
          const advice = burstAdvice(wave);
          return (
            <button
              key={wave.pull}
              type="button"
              className={`route-node ${advice.tone}${wave.isBoss ? ' boss' : ''}${wave.pull === currentPull ? ' on' : ''}`}
              style={{
                left: `${(point.x / projection.width) * 100}%`,
                top: `${(point.y / projection.height) * 100}%`,
              }}
              onClick={() => choose(wave.pull)}
              aria-pressed={wave.pull === currentPull}
              aria-label={`第 ${wave.pull} 波，${wave.mobCount} 只，${TYPE(wave)}`}
              title={`第 ${wave.pull} 波 · ${wave.mobCount} 只 · ${advice.text}`}
            >
              {wave.pull}
            </button>
          );
        })}
        <div className="route-map-legend">
          <span><i className="route-line-key" />路线</span>
          <span><i className="route-node-key" />波次中心</span>
          <span><i className="route-node-key yes" />开</span>
          <span><i className="route-node-key maybe" />看下一波 / 看冷却</span>
          <span><i className="route-node-key no" />不开</span>
          <span>{route.pulls} 波 · {route.totalMobs} 只</span>
        </div>
      </div>

      <div className="route-sheet">
        <div className="map-current" aria-live="polite">
          <span className="tb-k">当前选中</span>
          <b>
            第 {current?.pull ?? '—'} 波 · {current ? TYPE(current) : '未选择'}
            {current?.encounter ? ` · ${current.encounter}` : ''}
          </b>
          <div className="map-mobs">
            {current?.mobs.length
              ? current.mobs.map((mob) => <span key={mob.name}>{mob.name} ×{mob.count}</span>)
              : <span>空波次，没有怪物构成</span>}
          </div>
          {currentAdvice ? <span className={`adv ${currentAdvice.tone}`}>{currentAdvice.text}</span> : null}
        </div>

        <div className="route-sheet-head">
          <b>整条路线</b>
          <span>{route.pulls} 波全部列出</span>
        </div>
        <div className="route-wave-list" aria-label="整条路线的波次顺序">
          {route.waves.map((wave) => {
            const advice = burstAdvice(wave);
            const active = wave.pull === currentPull;
            return (
              <button
                type="button"
                key={wave.pull}
                className={`route-wave-row${active ? ' on' : ''}${wave.isBoss ? ' boss' : ''}`}
                onClick={() => choose(wave.pull)}
                aria-pressed={active}
              >
                <span className="rwr-no">{String(wave.pull).padStart(2, '0')}</span>
                <span className="rwr-main">
                  <b>{TYPE(wave)} · {wave.mobCount} 只</b>
                  <small>
                    {wave.mobs.length
                      ? wave.mobs.map((mob) => `${mob.name} ×${mob.count}`).join(' · ')
                      : '空波次'}
                  </small>
                </span>
                <span className={`adv ${advice.tone}`}>{advice.text}</span>
              </button>
            );
          })}
        </div>
        <p className="note">
          {mapScope ? `${mapScope}。` : ''}
          地图上的线来自路线源图的波次连接，圆点是该波怪物坐标的中心；编号是波次顺序，不是计时。
          {route.waves.some((wave) => wave.mobCount === 0) ? ' 空波次没有敌人坐标，只保留在右侧列表。' : ''}
        </p>
      </div>
    </div>
  );
}
