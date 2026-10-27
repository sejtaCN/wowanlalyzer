import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  allRuns,
  ALTAR_WAVES,
  burstPairs,
  budgetFor,
  CHAPTERS,
  chaptersFor,
  FIGURES,
  getPhases,
  getRun,
  prioritySections,
  skillUsage,
} from '../apps/web/src/data/content';
import { DEFAULT_SPEC, findSpec, hasContent, SPECS } from '../apps/web/src/data/specs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('前端数据适配层', () => {
  it('数据模块存在且不再被 .gitignore 屏蔽', () => {
    const files = ['apps/web/src/data/content.ts', 'apps/web/src/data/specs.ts'];
    for (const file of files) {
      expect(existsSync(join(ROOT, file)), `${file} 不存在`).toBe(true);
      const ignored = (() => {
        try {
          execFileSync('git', ['check-ignore', '--no-index', '-q', file], {
            cwd: ROOT,
            stdio: 'ignore',
          });
          return true;
        } catch {
          return false;
        }
      })();
      expect(ignored, `${file} 仍被 .gitignore 屏蔽`).toBe(false);
    }
  });

  it('读取全部章节与唯一 runId', () => {
    expect(CHAPTERS).toHaveLength(11);
    const runs = allRuns();
    expect(runs).toHaveLength(246);
    expect(new Set(runs.map((run) => run.runId)).size).toBe(246);
    expect(getRun('dec_voidform_on_1__w30_8__5000')?.targets).toBe(8);
    expect(getRun('missing-run')).toBeNull();
  });

  it('保留图契约、路线、日志和优先级数据', () => {
    const figures = Object.values(FIGURES).flat();
    expect(figures.filter((figure) => figure.status === 'ready')).toHaveLength(48);
    expect(figures.filter((figure) => figure.status === 'missing')).toHaveLength(2);
    expect(figures.filter((figure) => figure.status === 'not-applicable')).toHaveLength(5);

    expect(ALTAR_WAVES.pulls).toBe(14);
    expect(ALTAR_WAVES.waves).toHaveLength(14);
    expect(getPhases('xiaohuasheng-phases')?.phases).toHaveLength(9);

    const priorityRows = prioritySections().flatMap((section) => section.rows);
    expect(priorityRows).toHaveLength(38);
    expect(skillUsage()).toHaveLength(24);
    expect(budgetFor('w30_8')?.runId).toBe('trace_archon__w30_8__5000');
  });

  it('能按章节声明的 runId 配对爆发数据', () => {
    const chapter = CHAPTERS.find((item) => item.id === 'l1-02-large');
    expect(chapter?.chart.runIds).toHaveLength(2);
    const pairs = burstPairs(chapter?.chart.runIds ?? []);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].label).toContain('8 目标');
    expect(pairs[0].deltaPct).toBeGreaterThan(0);
    expect(pairs[0].deltaDamage).toBeGreaterThan(0);

    const adds = CHAPTERS.find((item) => item.id === 'l1-06-adds');
    expect(burstPairs(adds?.chart.runIds ?? [])).toHaveLength(2);
  });
});

describe('专精注册表', () => {
  it('默认专精有内容，未实装专精返回空章节与空 run 列表', () => {
    expect(findSpec(DEFAULT_SPEC)?.status).toBe('active');
    expect(hasContent(DEFAULT_SPEC)).toBe(true);
    expect(chaptersFor(DEFAULT_SPEC)).toHaveLength(11);
    expect(SPECS.find((spec) => spec.status === 'planned')).toBeDefined();
    expect(chaptersFor('devourer')).toEqual([]);
    expect(allRuns('devourer')).toEqual([]);
  });
});
