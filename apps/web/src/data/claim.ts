import type { Chapter, ClaimFieldSpec } from '@learn';
import { conservativeDeltaCiPct, getRun } from './content';

/**
 * claim 的占位符解析。
 *
 * 一条纪律：正文里的数字一个都不许写死。claim 只写占位符（`{{bossDamageM}}`），
 * 具体数值在这里从 runId 现算——换版本重跑后页面自己跟着变，也不会出现
 * 「文案说 5.15M、图上是 5.31M」这种对不上的情况。取不到就直接不给文本，
 * 由 `validate:content` 在构建前报错，不做静默兜底。
 */

export interface ClaimResolution {
  /** 占位符全部取到才有文本，否则为空串 */
  text: string;
  /** 取不到的占位符名（门禁会把这些点名） */
  missing: string[];
  values: Record<string, number>;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function format(value: number, decimals?: number): string {
  const digits = decimals ?? (Number.isInteger(value) ? 0 : 2);
  return value.toFixed(digits);
}

function fromPair(spec: ClaimFieldSpec, field: ClaimFieldSpec['field']): number | null {
  const [onId, offId] = spec.pair ?? [];
  const on = getRun(onId);
  const off = getRun(offId);
  if (!on || !off) return null;
  const onDps = on.dps;
  const offDps = off.dps;
  switch (field) {
    case 'onDps': return onDps;
    case 'offDps': return offDps;
    case 'ciPct': return conservativeDeltaCiPct(on, off);
    case 'durationSec': return on.durationSec ?? null;
    case 'targets': return on.targets;
    case 'deltaDamageM': return on.durationSec == null ? null : ((onDps - offDps) * on.durationSec) / 1e6;
    case 'deltaPct': return offDps > 0 ? ((onDps - offDps) / offDps) * 100 : null;
    default: return null;
  }
}

function fromSingle(spec: ClaimFieldSpec): number | null {
  const run = getRun(spec.runId);
  if (!run) return null;
  if (spec.field === 'durationSec') return run.durationSec;
  if (spec.field === 'targets') return run.targets;
  return null;
}

export function resolveClaim(chapter: Pick<Chapter, 'claim' | 'claimFields'>): ClaimResolution {
  const template = chapter.claim ?? '';
  const specs = chapter.claimFields ?? {};
  const values: Record<string, number> = {};
  const missing: string[] = [];
  if (!template) return { text: '', missing, values };

  // 第一轮：直接从 runId 取值（配对差值 / 单条字段）
  for (const [name, spec] of Object.entries(specs)) {
    if (spec.of) continue;
    const value = spec.pair ? fromPair(spec, spec.field) : fromSingle(spec);
    if (value == null || !Number.isFinite(value)) continue;
    values[name] = value;
  }
  // 第二轮：比值字段引用第一轮的结果，避免循环引用
  for (const [name, spec] of Object.entries(specs)) {
    if (!spec.of) continue;
    const [a, b] = spec.of;
    const left = values[a];
    const right = values[b];
    if (left == null || right == null || right === 0) continue;
    values[name] = (left / right) * 100;
  }

  const text = template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name];
    if (value == null) {
      missing.push(name);
      return whole;
    }
    const spec = specs[name];
    // 比值一律按整数百分比给（41%），其余小数位按 spec 或默认规则
    return format(value, spec?.decimals ?? (spec?.field === 'ratioPct' ? 0 : undefined));
  });

  return { text: missing.length ? '' : text, missing, values };
}

/** 模板里出现的占位符（校验空闲字段用） */
export function claimPlaceholders(template: string | undefined): string[] {
  if (!template) return [];
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1]);
}
