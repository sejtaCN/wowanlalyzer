/**
 * 学习进度：极简。只记"看过哪些章"，不做完成率、不打分、不记录作答。
 * 存在本机 localStorage，损坏时另存一份再降级，不静默覆盖。
 */
export const PROGRESS_KEY = 'wowa.progress.v3';

export interface Progress {
  schemaVersion: 3;
  /** 已看过的章节 id */
  seen: string[];
  updatedAt: string;
}

export function emptyProgress(now = new Date().toISOString()): Progress {
  return { schemaVersion: 3, seen: [], updatedAt: now };
}

export interface LoadResult {
  progress: Progress;
  status: 'empty' | 'ok' | 'migrated' | 'quarantined';
  note?: string;
}

export function parseProgress(raw: string | null, now = new Date().toISOString()): LoadResult {
  if (!raw) return { progress: emptyProgress(now), status: 'empty' };
  try {
    const v = JSON.parse(raw) as Partial<Progress> & { schemaVersion?: number };
    if (!v || typeof v !== 'object') throw new Error('not an object');
    if (v.schemaVersion !== 3) {
      return {
        progress: { ...emptyProgress(now), seen: Array.isArray(v.seen) ? v.seen : [] },
        status: 'migrated',
        note: `旧版本进度（schema ${v.schemaVersion ?? '?'}）已迁移到 v3`,
      };
    }
    return {
      progress: {
        schemaVersion: 3,
        seen: Array.isArray(v.seen) ? v.seen.filter((x): x is string => typeof x === 'string') : [],
        updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : now,
      },
      status: 'ok',
    };
  } catch {
    return { progress: emptyProgress(now), status: 'quarantined', note: '进度文件读不出来，已按空进度处理（原文件不会被覆盖）' };
  }
}

export function markSeen(p: Progress, chapterId: string, now = new Date().toISOString()): Progress {
  if (p.seen.includes(chapterId)) return p;
  return { ...p, seen: [...p.seen, chapterId], updatedAt: now };
}

