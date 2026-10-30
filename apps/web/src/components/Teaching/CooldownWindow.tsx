import React from 'react';
import { COOLDOWN_WINDOW } from '../../data/content';

const f1 = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 两波间隔：不是「再跑一场两波」，而是把三个实测数组放到同一条时间轴上。
 * 观测冷却来自动作序列，收益来自 A/B，155.7 秒来自日志节奏；页面明确说是 C 层算术。
 */
export default function CooldownWindow() {
  const d = COOLDOWN_WINDOW;
  const maxSec = 240;
  const pct = (s: number) => `${Math.min(100, (s / maxSec) * 100)}%`;
  const cd = d.cooldown.observedMaxSec;

  return (
    <div className="cw" data-figure-kind="cooldown-window">
      <div className="cw-hd">
        <b>两波之间，冷却够不够</b>
        <span className="note">算术推断 · 不是两波连打模拟</span>
      </div>

      <div className="kpis cw-kpis">
        <div>
          <div className="k">观测冷却上限</div>
          <div className="v">{f1(cd)}<small> 秒</small></div>
        </div>
        <div>
          <div className="k">大波一次</div>
          <div className="v">{(d.returns.big.deltaDamage / 1e6).toFixed(2)}<small>M</small></div>
        </div>
        <div>
          <div className="k">小波一次</div>
          <div className="v">{(d.returns.small.deltaDamage / 1e6).toFixed(2)}<small>M</small></div>
        </div>
      </div>

      <div className="cw-timeline">
        <div className="cw-zones">
          <span className="one" style={{ width: pct(cd) }}>间隔 &lt; {f1(cd)}s：只能给一波</span>
          <span className="both" style={{ width: `calc(100% - ${pct(cd)})` }}>≥ {f1(cd)}s：两波都能开</span>
        </div>
        <div className="cw-track">
          <i className="cw-threshold" style={{ left: pct(cd) }} />
        </div>
        <div className="cw-axis">
          <span>0s</span>
          <span>两波之间的间隔</span>
          <span>{maxSec}s</span>
        </div>
        <div className="cw-legend">
          <span><i className="cw-key threshold" />观测冷却上限 {f1(cd)}s</span>
          <span><i className="cw-key band" />低于这条线：两次爆发只能选一次</span>
        </div>
      </div>

      <div className="cw-cases">
        <div>
          <span className="cw-case-k">间隔 &lt; {f1(cd)}s</span>
          <p>只能给一波：大波 {(d.returns.big.deltaDamage / 1e6).toFixed(2)}M，小波 {(d.returns.small.deltaDamage / 1e6).toFixed(2)}M。给大波。</p>
        </div>
        <div>
          <span className="cw-case-k">间隔 ≥ {f1(cd)}s</span>
          <p>两波各一次：大波 {(d.returns.big.deltaDamage / 1e6).toFixed(2)}M + 小波 {(d.returns.small.deltaDamage / 1e6).toFixed(2)}M，不需要二选一。</p>
        </div>
      </div>

      <p className="note">
        具体某一波能不能开，要拿那一波的间隔和 {f1(cd)} 秒比；这份数据只给规则，不给某一场的具体两波结论。{d.limitation}
      </p>
      <details className="pm-raw">
        <summary>来源记录</summary>
        <div className="note">{d.cooldown.sourceRuns.join(' / ')} · {d.returns.sourceRuns.join(' / ')}</div>
      </details>
    </div>
  );
}
