import React, { useEffect } from 'react';
import type { Chapter } from '@learn';
import { ChapterBody } from '../components/ChapterSections';
import ChapterToc from '../components/ChapterToc';

export default function ChapterView({
  chapter,
  onSee,
  onBack,
}: {
  chapter: Chapter;
  onSee: (id: string) => void;
  onBack: () => void;
}) {
  useEffect(() => {
    onSee(chapter.id);
    window.scrollTo({ top: 0 });
  }, [chapter.id, onSee]);

  const readerRefresh = chapter.level !== 'L0';
  const page = (
    <div className={`page${readerRefresh ? ' reader-page' : ''}`}>
      <div className="crumb">
        <button
          onClick={onBack}
          style={{ border: 0, background: 'none', color: 'var(--accent2)', cursor: 'pointer', font: 'inherit', padding: 0 }}
        >
          ← 学习
        </button>
        {' / '}
        {chapter.level} / <b>{chapter.title}</b>
      </div>
      <h1>{chapter.title}</h1>
      <p className="page-sub">{chapter.subtitle}</p>
      <ChapterBody key={chapter.id} chapter={chapter} />
    </div>
  );

  if (!readerRefresh) return page;

  return (
    <div className="chapter-shell">
      <ChapterToc />
      {page}
    </div>
  );
}
