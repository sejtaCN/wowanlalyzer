import React from 'react';
import { groupByLevel, nextChapter, type Chapter, type ChapterLevel } from '@learn';
import { ALTAR_WAVES, allRuns, getRun } from '../data/content';
import { COACHING, CoachingCards } from '../components/Coaching';
import { Section } from '../components/ChapterSections';
import { parseTargets } from '../components/Teaching/rules';

const LEVEL_META: Record<ChapterLevel, { title: string; sub: string }> = {
  L0: { title: 'L0 基础', sub: '只学一次：资源、技能、优先级、爆发' },
  L1: { title: 'L1 波次模型', sub: '跨副本复用：中波 / 大波 / 小波 / BOSS / 节奏 / ADD' },
  L2: { title: 'L2 副本实战', sub: '把模型套到具体路线：哪一波开爆发' },
};

/** 学习路径图：三站 + 章节节点。只标“下一步”，不算完成率。 */
function PathFigure({
  chapters,
  seen,
  next,
  onOpen,
}: {
  chapters: Chapter[];
  seen: string[];
  next: Chapter | null;
  onOpen: (id: string) => void;
}) {
  const levels: ChapterLevel[] = ['L0', 'L1', 'L2'];
  return (
    <div className="path">
      <div className="path-hd">从规则到路线 <span>当前下一步用金色标出</span></div>
      {levels.map((lv) => {
        const all = chapters.filter((c) => c.level === lv);
        const isNextStage = next?.level === lv;
        return (
          <div className={`path-stage${isNextStage ? ' current' : ''}`} key={lv}>
            <span className="path-index">{lv}</span>
            <div className="path-stage-main">
              <div className="path-stage-hd">
                <b>{LEVEL_META[lv].title}</b>
                <small>{LEVEL_META[lv].sub}</small>
              </div>
              <div className="path-track">
                {all.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`path-dot2${next?.id === c.id ? ' current' : ''}${seen.includes(c.id) ? ' seen' : ''}`}
                    onClick={() => onOpen(c.id)}
                    title={c.title}
                    aria-label={c.title}
                  />
                ))}
              </div>
              <span className="path-count">{all.length} 章</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 章节卡的微型波次图：L0 = 四个知识节点；模型页 = 实际目标数方块（最多画 10 个）。 */
function ChapterPreview({ chapter }: { chapter: Chapter }) {
  if (!chapter.model) {
    return (
      <span className="chap-preview l0" aria-hidden>
        {[0, 1, 2, 3].map((i) => <i key={i} />)}
      </span>
    );
  }
  const range = parseTargets(chapter.model.targets);
  const count = Math.max(1, Math.min(10, range ? Math.max(range[0], range[1]) : 1));
  return (
    <span className="chap-preview" aria-hidden>
      {Array.from({ length: count }, (_, i) => <i key={i} />)}
    </span>
  );
}

export default function Home({
  chapters,
  seen,
  onOpen,
  onAnalyzer,
}: {
  chapters: Chapter[];
  seen: string[];
  onOpen: (id: string) => void;
  onAnalyzer: () => void;
}) {
  const groups = groupByLevel(chapters);
  const next: Chapter | null = nextChapter(chapters, seen);
  const runs = allRuns();
  const simc = runs[0]?.simc;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-split">
        <div>
        <div className="kicker">从认技能到进副本</div>
        {next ? (
          <>
            <h1>
              下一步：{next.title}
            </h1>
            <p>{next.subtitle}</p>
            <div className="hero-chain" aria-hidden>
              <span>① 认规则</span><i>→</i><span>② 分波次</span><i>→</i><span>③ 进路线</span>
            </div>
            <button className="btn" onClick={() => onOpen(next.id)}>
              打开这一章
            </button>
          </>
        ) : (
          <>
            <h1>主线章节都打开了</h1>
            <p>想深挖就去解析台看数据、联动和每一条 runId。</p>
            <button className="btn" onClick={onAnalyzer}>
              去解析台
            </button>
          </>
        )}
        </div>
        <PathFigure chapters={chapters} seen={seen} next={next} onOpen={onOpen} />
        </div>
      </section>

      <div className="groups">
        {(['L0', 'L1', 'L2'] as ChapterLevel[]).map((level) => (
          <div className="group" key={level}>
            <div className="hd">
              <b>{LEVEL_META[level].title}</b>
              <span>{LEVEL_META[level].sub}</span>
            </div>
            {groups[level].length ? (
              groups[level].map((c) => (
                <button key={c.id} data-chapter-id={c.id} className={`chap${seen.includes(c.id) ? ' seen' : ''}${next?.id === c.id ? ' next' : ''}`} onClick={() => onOpen(c.id)}>
                  <span className="dot" aria-hidden />
                  <ChapterPreview chapter={c} />
                  <span className="t">
                    {c.title}
                    <small>{c.subtitle}</small>
                  </span>
                  <span className="chev" aria-hidden>›</span>
                </button>
              ))
            ) : (
              <div className="chap" style={{ color: 'var(--muted)', cursor: 'default' }}>
                <span className="dot" aria-hidden />
                <span className="t">
                  这一层还没有章节
                  <small>写完就会出现在这里</small>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <Section
        question={COACHING.title}
        tag="按优先级排"
        note={<>{COACHING.subtitle}　<span style={{ color: 'var(--gold)' }}>{COACHING.hero}</span></>}
      >
        <CoachingCards />
      </Section>


      <div className="statusline">
        <span>SimC {simc?.version ?? '—'} ({simc?.commit?.slice(0, 7) ?? '—'})</span>
        <span>执政官 runId {runs.length} 个</span>
        <span>章节 {chapters.length} 篇</span>
        <span>路线 {ALTAR_WAVES.pulls} 波 / {ALTAR_WAVES.totalMobs} 只</span>
        <span>日志 1 场 · 阶段推断 9 段</span>
      </div>
    </div>
  );
}

/* 供章节页复用：按 id 找章节 */
export function findChapter(chapters: Chapter[], id: string): Chapter | null {
  return chapters.find((c) => c.id === id) ?? null;
}

export function hasRun(id: string): boolean {
  return getRun(id) !== null;
}
