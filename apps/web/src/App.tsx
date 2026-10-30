import React, { useEffect, useState } from 'react';
import { PRODUCT } from '@learn';
import { SPECS } from './data/specs';
import { SpecProvider, useSpec } from './state/spec';
import { useProgress } from './state/progress';
import Home, { findChapter } from './views/Home';
import ChapterView from './views/ChapterView';
import Analyzer from './views/Analyzer';
import ComingSoon from './views/ComingSoon';
import { ARCHON_PROFILE_ID, chaptersFor } from './data/content';

type Screen = { name: 'home' } | { name: 'chapter'; id: string } | { name: 'analyzer' };

/** 专精切换：当前只实装暗牧，但界面按"多专精"设计，未实装的也能进去看骨架 */
function SpecSwitcher() {
  const { spec, setSpec } = useSpec();
  const [open, setOpen] = useState(false);
  const activeHero = spec.heroTrees.find((hero) => hero.status === 'active');
  return (
    <div className="specsw-wrap">
      <button className="specsw" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`statusdot ${spec.status}`} aria-hidden />
        <span className="specsw-name">{spec.name}</span>
        <span className="specsw-class">{spec.className} · {activeHero?.name ?? '—'}</span>
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="specmenu" role="listbox" aria-label="选择专精">
            <div className="specmenu-hd">专精</div>
            {SPECS.map((s) => (
              <button
                key={s.id}
                role="option"
                aria-selected={s.id === spec.id}
                className={`specitem${s.id === spec.id ? ' on' : ''}`}
                onClick={() => {
                  setSpec(s.id);
                  setOpen(false);
                }}
              >
                <span className={`statusdot ${s.status}`} aria-hidden />
                <span className="specitem-main">
                  <b>{s.name}</b>
                  <small>
                    {s.className} · {s.heroTrees.map((h) => h.status === 'active' ? h.name : `${h.name}（待补）`).join(' / ') || '—'}
                  </small>
                </span>
                {s.status === 'planned' ? <span className="specitem-tag">筹备中</span> : null}
              </button>
            ))}
            <div className="specmenu-ft">当前只开放执政官；虚空编织者数据待补</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Shell() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const { progress, note, see } = useProgress();
  const { spec, ready } = useSpec();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen.name, spec.id]);

  const chapters = chaptersFor(spec.id, ARCHON_PROFILE_ID);
  const chapter = screen.name === 'chapter' ? findChapter(chapters, screen.id) : null;
  // 顶栏进度：按层级数已读篇数，读过的用 progress.seen
  const seenLevels = ['L0', 'L1', 'L2'].map((level) => {
    const total = chapters.filter((item) => item.level === level).length;
    const seenCount = chapters.filter((item) => item.level === level && progress.seen.includes(item.id)).length;
    return { level, total, seenCount };
  });

  return (
    <>
      <header className={`topbar${chapter && chapter.level !== 'L0' ? ' reader-topbar' : ''}`}>
        <span className="brand">{PRODUCT.name}</span>
        <SpecSwitcher />
        <nav>
          <button aria-current={screen.name !== 'analyzer'} onClick={() => setScreen({ name: 'home' })}>
            学习
          </button>
          <button aria-current={screen.name === 'analyzer'} onClick={() => setScreen({ name: 'analyzer' })}>
            解析台
          </button>
        </nav>
        <span
          className="nav-levels"
          data-seen={seenLevels.map((item) => `${item.level}:${item.seenCount}/${item.total}`).join(',')}
          title="按层级数已读篇数"
        >
          {seenLevels.map((item) => (
            <span key={item.level}>{item.level} <b>{item.seenCount}</b>/{item.total}</span>
          ))}
        </span>
      </header>

      {note ? (
        <div style={{ background: 'rgba(245,196,81,0.08)', borderBottom: '1px solid rgba(245,196,81,0.2)', padding: '7px 24px', fontSize: 12, color: 'var(--ink-on-gold-soft)' }}>
          {note}
        </div>
      ) : null}

      {!ready ? <ComingSoon onBack={() => setScreen({ name: 'home' })} /> : null}

      {ready && screen.name === 'home' ? (
        <Home
          chapters={chapters}
          seen={progress.seen}
          onOpen={(id) => setScreen({ name: 'chapter', id })}
          onAnalyzer={() => setScreen({ name: 'analyzer' })}
        />
      ) : null}

      {ready && screen.name === 'chapter' && chapter ? (
        <ChapterView chapter={chapter} onSee={see} onBack={() => setScreen({ name: 'home' })} />
      ) : null}

      {ready && screen.name === 'chapter' && !chapter ? (
        <div className="page">
          <div className="empty">找不到这一章。回目录换一篇试试。</div>
        </div>
      ) : null}

      {ready && screen.name === 'analyzer' ? <Analyzer /> : null}
    </>
  );
}

export default function App() {
  return (
    <SpecProvider>
      <Shell />
    </SpecProvider>
  );
}
