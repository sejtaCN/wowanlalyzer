import { useCallback, useEffect, useRef, useState } from 'react';
import { PROGRESS_KEY, emptyProgress, markSeen, parseProgress, type Progress } from '@learn';

/** 本机进度：只记看过哪些章。不做完成率、不打分。 */
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(() => emptyProgress());
  const [note, setNoteText] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(PROGRESS_KEY);
    } catch {
      raw = null;
    }
    const r = parseProgress(raw);
    setProgress(r.progress);
    setNoteText(r.note ?? null);
    loaded.current = true;
  }, []);

  const persist = useCallback((p: Progress) => {
    setProgress(p);
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch {
      /* 存不进去就算了，页面照常可用 */
    }
  }, []);

  const see = useCallback((chapterId: string) => persist(markSeen(progress, chapterId)), [persist, progress]);

  return { progress, note, see, ready: loaded.current };
}
