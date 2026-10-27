import React, { useEffect, useState } from 'react';

const fallbackItems = [
  { no: '①', label: '场景' },
  { no: '②', label: '爆发价值' },
  { no: '③', label: '技能调整' },
  { no: '④', label: '路线位置' },
  { no: '⑤', label: '真人对照' },
];

export default function ChapterToc() {
  const [items, setItems] = useState(fallbackItems);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('.reader-page .sec')];
    if (!sections.length) return;

    setItems(sections.map((section, index) => ({
      no: section.querySelector('.sec-no')?.textContent?.trim() || fallbackItems[index]?.no || '',
      label: section.querySelector('h2')?.textContent?.trim() || fallbackItems[index]?.label || '',
    })));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!visible) return;
        const index = sections.indexOf(visible.target as HTMLElement);
        if (index >= 0) setActive(index);
      },
      { rootMargin: '-96px 0px -58% 0px', threshold: [0, 0.25, 0.6] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const jumpTo = (index: number) => {
    const section = document.querySelectorAll<HTMLElement>('.reader-page .sec')[index];
    if (!section) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <nav className="chapter-toc" aria-label="本页目录">
      <div className="chapter-toc-title">本页</div>
      {items.map((item, index) => (
        <button
          key={`${item.no}-${item.label}`}
          type="button"
          aria-current={active === index ? 'location' : undefined}
          onClick={() => jumpTo(index)}
        >
          <span>{item.no}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
