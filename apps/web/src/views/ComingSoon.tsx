import React from 'react';
import { useSpec } from '../state/spec';
import { allRuns, ARCHON_PROFILE_ID, chaptersFor } from '../data/content';
import { ChapterWireframe, LeverageWireframe, Pipeline, WaveWireframe, WireCard, type PipelineStep } from '../components/Teaching/Skeleton';

/**
 * 未实装专精：按 docs/writing-style.md 写——
 * 先结论、每节配图、术语给大白话、空态给形状不给形容词。
 * 灰模来自 components/Teaching/Skeleton（和实装页共用一套形状）。
 */

const PIPELINE: PipelineStep[] = [
  { key: 'profile', label: '专精配置', sub: 'SimC profile + APL', ready: false, status: '待配置' },
  { key: 'sims', label: '模拟跑批', sub: '每个波次模型 5000 次', ready: false, status: '待跑批' },
  { key: 'analysis', label: '分析', sub: '联动 / 杠杆 / 伤害构成', ready: false, status: '待分析' },
  { key: 'chapters', label: '章节稿', sub: '内容 JSON + 来源校验', ready: false, status: '待成稿' },
  { key: 'ui', label: '页面', sub: '下面这些模板', ready: true, status: '已就绪' },
];

export default function ComingSoon({ onBack }: { onBack: () => void }) {
  const { spec, setSpec } = useSpec();
  const hero = spec.heroTrees.map((h) => (h.status === 'active' ? h.name : `${h.name}（待补）`)).join(' / ');
  const done = PIPELINE.filter((p) => p.ready).length;
  const filledChapters = chaptersFor('shadow-priest', ARCHON_PROFILE_ID).length;
  const filledRuns = allRuns('shadow-priest', ARCHON_PROFILE_ID).length;

  return (
    <div className="page">
      <div className="crumb">
        <button onClick={onBack}>← 学习</button> / {spec.className} / <b>{spec.name}</b>
      </div>

      <section className="hero">
        <div className="kicker">数据筹备中 · 界面已就绪</div>
        <h1>
          {spec.name}
          {hero ? <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {hero}</span> : null}
        </h1>
        <p>页面模板已就绪，前四步数据待补。补齐后页面自动长出来，不用改界面。</p>
        <Pipeline steps={PIPELINE} />
        <div className="hero-actions">
          <button className="btn" onClick={() => setSpec('shadow-priest')}>
            切回暗影牧师，看填满的样子
          </button>
          <span className="note">
            进度 {done} / {PIPELINE.length}　·　下一步：{PIPELINE.find((p) => !p.ready)?.status}
          </span>
        </div>
      </section>

      <section className="sec">
        <div className="sec-hd">
          <h2>接上数据之后，长这样</h2>
        </div>
        <p className="sec-note" style={{ marginBottom: 14 }}>
          三张灰模是真实组件的骨架：形状不变，里面的数字会换成 {spec.name} 的模拟结果。每张图下面一句话，说明它回答什么问题。
        </p>
        <div className="wiregrid">
          <WireCard cap={<><b>章节页</b>：固定五段，每段一张图 + 一句话。</>}>
            <ChapterWireframe />
          </WireCard>
          <WireCard cap={<><b>副本页</b>：逐波回答"开 / 看冷却 / 不开"，柱高是这一波的怪数。</>}>
            <WaveWireframe />
          </WireCard>
          <WireCard cap={<><b>解析台</b>：把技能逐个删掉再模拟，条越长越不能少。</>}>
            <LeverageWireframe />
          </WireCard>
        </div>
      </section>

      <section className="sec">
        <div className="sec-hd">
          <h2>还差什么</h2>
          <span className="sec-tag pending">按顺序补，前一步不做完下一步没意义</span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th style={{ width: 132 }}>要做的</th>
                <th>产出什么</th>
                <th style={{ width: 158 }}>放哪 / 命令</th>
              </tr>
            </thead>
            <tbody>
              <tr className="ph-mark">
                <td className="n dim">1</td>
                <td>拿到专精配置<span className="ph-flag" style={{ marginLeft: 6 }}>下一步</span></td>
                <td>一份含 APL 的 SimC profile（APL＝机器读的技能优先级表）</td>
                <td className="mono dim">content/profiles/</td>
              </tr>
              <tr>
                <td className="n dim">2</td>
                <td>跑模拟与杠杆</td>
                <td>每个波次模型的 DPS，以及每个技能禁用后的差值</td>
                <td className="mono dim">sims-run.mjs<br />leverage.mjs</td>
              </tr>
              <tr>
                <td className="n dim">3</td>
                <td>写章节稿</td>
                <td>内容 JSON：五段齐全，每个数字必须带 runId</td>
                <td className="mono dim">content/chapters/</td>
              </tr>
              <tr>
                <td className="n dim">4</td>
                <td>过校验并上线</td>
                <td>无来源的数字会被拦下；通过后状态变成「已上线」</td>
                <td className="mono dim">validate:content<br />content/specs.json</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="note" style={{ marginTop: 6 }}>
        想看填满的样子：切回暗影牧师——{filledChapters} 篇章节、{filledRuns} 个执政官 runId、9 段真实日志阶段。虚空编织者待补。
      </p>
    </div>
  );
}
