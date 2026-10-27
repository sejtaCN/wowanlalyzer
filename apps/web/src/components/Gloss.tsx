import React, { useMemo } from 'react';
import glossary from '../../../../content/glossary.json';

interface Term {
  en: string;
  plain: string;
}

const TERMS = (glossary.terms ?? {}) as Record<string, Term>;

/** 长词优先，避免"暗言术：痛"被"暗言术"截断 */
const KEYS = Object.keys(TERMS).sort((a, b) => b.length - a.length);

/**
 * 把文本里出现的术语包成悬停解释（类 Wowhead tooltip）。
 * 只做展示，不改变文案本身；术语第一次出现就有解释，不需要读者去查。
 */
export function Gloss({ text }: { text: string }) {
  const parts = useMemo(() => {
    if (!KEYS.length) return [{ t: text, term: null as string | null }];
    const pattern = new RegExp(`(${KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    const out: { t: string; term: string | null }[] = [];
    let last = 0;
    for (const m of text.matchAll(pattern)) {
      const i = m.index ?? 0;
      if (i > last) out.push({ t: text.slice(last, i), term: null });
      out.push({ t: m[0], term: m[0] });
      last = i + m[0].length;
    }
    if (last < text.length) out.push({ t: text.slice(last), term: null });
    return out;
  }, [text]);

  return (
    <>
      {parts.map((p, i) =>
        p.term ? (
          <abbr
            key={`${p.term}-${i}`}
            className="term"
            title={`${TERMS[p.term].en} · ${TERMS[p.term].plain}`}
          >
            {p.t}
          </abbr>
        ) : (
          <React.Fragment key={`t-${i}`}>{p.t}</React.Fragment>
        ),
      )}
    </>
  );
}
