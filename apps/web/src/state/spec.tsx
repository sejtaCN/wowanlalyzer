import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SPEC, SPECS, findSpec, hasContent, type SpecEntry } from '../data/specs';

const KEY = 'wowa.spec.v1';

interface SpecCtx {
  specId: string;
  spec: SpecEntry;
  ready: boolean;
  setSpec: (id: string) => void;
}

const Ctx = createContext<SpecCtx | null>(null);

export function SpecProvider({ children }: { children: React.ReactNode }) {
  const [specId, setId] = useState<string>(DEFAULT_SPEC);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved && findSpec(saved)) setId(saved);
    } catch {
      /* 读不到就用默认 */
    }
  }, []);

  const setSpec = useCallback((id: string) => {
    if (!findSpec(id)) return;
    setId(id);
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      /* 存不进去不影响使用 */
    }
  }, []);

  const value = useMemo<SpecCtx>(() => {
    const spec = findSpec(specId) ?? SPECS[0];
    return { specId, spec, ready: hasContent(specId), setSpec };
  }, [specId, setSpec]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSpec(): SpecCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSpec 必须在 SpecProvider 内使用');
  return v;
}
