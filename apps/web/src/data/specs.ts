import rawSpecs from '../../../../content/specs.json';

export interface HeroTree {
  id: string;
  name: string;
}

export interface SpecEntry {
  id: string;
  className: string;
  name: string;
  short: string;
  status: 'active' | 'planned';
  heroTrees: HeroTree[];
  baseline: string;
  note?: string;
}

interface SpecsDoc {
  note: string;
  specs: SpecEntry[];
}

const doc = rawSpecs as SpecsDoc;

/** 专精注册表的唯一前端入口，内容来自 content/specs.json。 */
export const SPECS: SpecEntry[] = doc.specs;

export const DEFAULT_SPEC =
  SPECS.find((spec) => spec.status === 'active')?.id ?? SPECS[0]?.id ?? '';

export function findSpec(id: string): SpecEntry | null {
  return SPECS.find((spec) => spec.id === id) ?? null;
}

export function hasContent(id: string): boolean {
  return findSpec(id)?.status === 'active';
}
