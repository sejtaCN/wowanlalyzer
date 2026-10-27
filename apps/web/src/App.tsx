import React, { useEffect, useState } from 'react';
import { PRODUCT } from '@learn';
import { SPECS } from './data/specs';
import { SpecProvider, useSpec } from './state/spec';
import { useProgress } from './state/progress';
import Home, { findChapter } from './views/Home';
import ChapterView from './views/ChapterView';
import Analyzer from './views/Analyzer';
import ComingSoon from './views/ComingSoon';
import { chaptersFor } from './data/content';

type Screen = { name: 'home' } | { name: 'chapter'; id: string } | { name: 'analyzer' };

/** 专精切换：当前只实装暗牧，但界面按"多专精"设计，未实装的也能进去看骨架 */
function SpecSwitcher() {
  const { spec, setSpec } = useSpec();
  const [open, setOpen] = useState(false);
  return (
    <div className="specsw-wrap">
      <button className="specsw" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`statusdot ${spec.status}`} aria-hidden />
        <span className="specsw-name">{spec.name}</span>
        <span className="specsw-class">{spec.className}</span>
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
                    {s.className} · {s.heroTrees.map((h) => h.name).join(' / ') || '—'}
                  </small>
                </span>
                {s.status === 'planned' ? <span className="specitem-tag">筹备中</span> : null}
              </button>
            ))}
            <div className="specmenu-ft">接上新专精只需要数据，不需要改界面</div>
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

  const chapters = chaptersFor(spec.id);
  const chapter = screen.name === 'chapter' ? findChapter(chapters, screen.id) : null;

  return (
    <>
      <header className="topbar">
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
          <div className="empty">找不到这一章（id: {screen.id}）。</div>
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
