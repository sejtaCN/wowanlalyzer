import React from 'react';
import { getLog, skillName } from '../../data/content';

/** 日志里的英文施法名 → APL 键；中文名仍从 skills.json 唯一来源取。 */
const KEY_BY_CAST: Record<string, string> = {
  'Mind Flay': 'mind_flay',
  'Mind Flay: Insanity': 'mind_flay_insanity',
  'Shadow Word: Madness': 'shadow_word_madness',
  'Shadow Word: Death': 'shadow_word_death',
  'Void Volley': 'void_volley',
  'Mind Blast': 'mind_blast',
  'Tentacle Slam': 'tentacle_slam',
  'Vampiric Touch': 'vampiric_touch',
  Halo: 'halo',
};

const PASSIVE = new Set(['Shadowy Apparition']);
const UTILITY = new Set([
  'Angelic Feather', 'Fade', 'Power Word: Fortitude', 'Levitate', 'Dispel Magic', 'Mass Dispel',
  'Desperate Prayer', 'Power Word: Shield', 'Dispersion', 'Vampiric Embrace', 'Silence',
  'Dominate Mind', 'Leap of Faith', 'Flash Heal', 'Vine Grip', 'Liquid Luster',
]);

/**
 * 真人施法次数：只回答「他实际按得最多的是什么」。
 * 被动触发单独折出，否则 1158 次暗影幻灵会把所有手动技能压成一条线。
 */
export default function CastChart({ logId }: { logId: string }) {
  const log = getLog(logId);
  if (!log) return <div className="empty">找不到日志 {logId}。</div>;
  const seg = log.segments[0];
  const top = [...(seg.topCasts ?? [])].sort((a, b) => b[1] - a[1]);
  const passive = top.filter(([name]) => PASSIVE.has(name)).reduce((n, [, v]) => n + v, 0);
  const manual = top.filter(([name]) => !PASSIVE.has(name) && !UTILITY.has(name)).slice(0, 9);
  const max = Math.max(...manual.map(([, v]) => v), 1);

  return (
    <div className="cast-chart" data-figure-kind="cast-chart">
      <div className="cast-hd">
        <b>整场实际施法</b>
        <span className="note">{seg.casts.toLocaleString()} 次 · {seg.castsPerMinute} 次/分 · GCD 中位 {seg.gcdMedian}s</span>
      </div>
      <div className="cast-passive">
        <span>被动触发</span>
        <b className="mono">{passive.toLocaleString()}</b>
        <span className="note">暗影幻灵：不占手动按键，单独看，不和循环技能混排。</span>
      </div>
      <div className="bars cast-bars">
        {manual.map(([name, count]) => {
          const key = KEY_BY_CAST[name];
          const label = key ? skillName(key).text : name;
          return (
            <div className="brow" key={name} style={{ gridTemplateColumns: '150px 1fr 52px' }}>
              <span>{label}</span>
              <span className="tr"><i style={{ width: `${(count / max) * 100}%` }} /></span>
              <span className="num">{count}</span>
            </div>
          );
        })}
      </div>
      <div className="note">
        只列前 9 个伤害技能；位移、保命、驱散等已排除。次数来自整场日志，不是某一波。
      </div>
    </div>
  );
}
