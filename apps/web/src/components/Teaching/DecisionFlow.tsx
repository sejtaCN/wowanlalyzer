import React from 'react';
import { burstAdvice, parseTargets } from './rules';

/**
 * DecisionFlow：三步判断「几只 → 多久 → 开不开」。
 *
 * 这是每一章顶图带的第三格，也是整页的读法：先数怪，再看这一段能活多久，
 * 最后落到一个动作。三步都由章节数据算出，不是写死的文案。
 */

export default function DecisionFlow({
  targets,
  durationSec,
  isBoss = false,
  isAdds = false,
  isRhythm = false,
  compact = false,
}: {
  targets: string | null;
  durationSec: number | null;
  isBoss?: boolean;
  isAdds?: boolean;
  isRhythm?: boolean;
  compact?: boolean;
}) {
  const range = parseTargets(targets);
  if (!range) {
    return <div className="figempty" data-figure-kind="missing">这一章没有波次模型：L0 不画波次图。</div>;
  }
  const [lo, hi] = range;
  const adv = isRhythm
    ? { text: '看间隔', tone: 'maybe' as const, why: '两波间隔 <122.4s 给大波；≥122.4s 两波都能开' }
    : isAdds
      ? { text: '开', tone: 'yes' as const, why: '加怪窗口看爆发放大倍数，不套普通目标数阈值' }
      : burstAdvice({ mobCount: lo, isBoss });
  const sameVerdict = isRhythm || isAdds || burstAdvice({ mobCount: hi, isBoss }).text === adv.text;

  const steps = [
    { n: 1, k: '几只', v: targets ?? `${lo} 只`, sub: isRhythm ? '大波 → 小波' : isAdds ? '加怪窗口' : isBoss ? '按 BOSS 档' : lo >= 7 ? '进入开爆发档' : lo >= 5 ? '看冷却' : '留冷却' },
    { n: 2, k: '多久', v: durationSec != null ? `${durationSec}s` : '—', sub: durationSec != null && durationSec >= 30 ? '模型假设满一轮' : '模型假设短窗口' },
    { n: 3, k: '开不开', v: adv.text, sub: sameVerdict ? '整档同一判断' : '看上沿' },
  ];

  if (compact) {
    return (
      <div className="df compact">
        <div className="df-inline">
          <span className="df-chip">
            <b>{targets}</b> 只
          </span>
          <i aria-hidden>›</i>
          <span className="df-chip">
            <b>{durationSec != null ? `${durationSec}s` : '—'}</b>
          </span>
          <i aria-hidden>›</i>
          <span className={`df-chip adv ${adv.tone}`}>{adv.text}</span>
        </div>
        <div className="tb-sub">{adv.why}</div>
      </div>
    );
  }

  return (
    <div className="df" data-figure-kind="decision-flow">
      {steps.map((s, i) => (
        <React.Fragment key={s.k}>
          <div className="df-step">
            <div className="df-n">{s.n}</div>
            <div className="df-k">{s.k}</div>
            <div className={`df-v${s.n === 3 ? ` adv ${adv.tone}` : ''}`}>{s.v}</div>
            <div className="df-sub">{s.sub}</div>
          </div>
          {i < steps.length - 1 ? <div className="df-arw" aria-hidden>→</div> : null}
        </React.Fragment>
      ))}
      <p className="df-note">
        {isRhythm
          ? `当前按两波间隔判：${adv.why}。`
          : isAdds
            ? `当前按加怪窗口判：${adv.why}。`
            : isBoss
              ? `当前按 BOSS 单体档：${adv.why}。`
              : `规则：≥7 只开 · 5–6 只看冷却 · ≤4 只不开。${adv.why}。`}
      </p>
    </div>
  );
}
