import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  allRuns,
  ARCHON_PROFILE_ID,
  ALTAR_WAVES,
  burstPairs,
  budgetFor,
  CHAPTERS,
  chaptersFor,
  FIGURES,
  getPhases,
  getRun,
  getSimulatedTimeline,
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
    expect(runs.length).toBeGreaterThan(180);
    expect(new Set(runs.map((run) => run.runId)).size).toBe(runs.length);
    expect(
      runs.every(
        (run) =>
          run.profileId === ARCHON_PROFILE_ID ||
          (!run.profileId && run.hero === ARCHON_PROFILE_ID),
      ),
    ).toBe(true);
    expect(getRun('dec_voidform_on_1__w30_8__5000')?.targets).toBe(8);
    expect(getRun('missing-run')).toBeNull();
  });

  it('Archon-only：拒绝 Voidweaver 与归属未知 run', () => {
    expect(getRun('voidweaver__st__5000')).toBeNull();
    expect(getRun('voidweaver__st__5000', 'voidweaver')).toBeNull();
    expect(getRun('dec_aoe_switch_5__st__5000')).toBeNull();
    expect(allRuns()).not.toContainEqual(expect.objectContaining({ profileId: 'voidweaver' }));
    expect(allRuns('shadow-priest', 'voidweaver')).toEqual([]);
    expect(chaptersFor('shadow-priest', 'voidweaver')).toEqual([]);
  });

  it('优先级表明确来自 Archon profile', async () => {
    const priority = JSON.parse(
      await import('node:fs/promises').then(({ readFile }) =>
        readFile(join(ROOT, 'content/guides/priority-table.json'), 'utf8'),
      ),
    );
    expect(priority.hero).toBe('archon');
    expect(priority.source).toBe('content/profiles/MID2_shadow_archon.simc');
    expect(priority.sections.flatMap((section: { rows: unknown[] }) => section.rows)).toHaveLength(38);
  });

  it('保留图契约、路线、日志和优先级数据', () => {
    const figures = Object.values(FIGURES).flat();
    expect(figures.filter((figure) => figure.status === 'ready')).toHaveLength(50);
    expect(figures.filter((figure) => figure.status === 'missing')).toHaveLength(0);
    expect(figures.filter((figure) => figure.status === 'not-applicable')).toHaveLength(5);

    expect(ALTAR_WAVES.pulls).toBe(15);
    expect(ALTAR_WAVES.waves).toHaveLength(15);
    expect(ALTAR_WAVES.totalForces).toBe(825);
    expect(ALTAR_WAVES.requiredForces).toBe(817);
    expect(ALTAR_WAVES.routePublicKey).toBe('xwt8Pza');
    expect(ALTAR_WAVES.waves.every((wave) => wave.enemyIds?.length === wave.mobCount)).toBe(true);
    expect(ALTAR_WAVES.waves.reduce((sum, wave) => sum + wave.forces, 0)).toBe(825);
    expect(getPhases('xiaohuasheng-phases')?.phases).toHaveLength(9);

    const priorityRows = prioritySections().flatMap((section) => section.rows);
    expect(priorityRows).toHaveLength(38);
    expect(skillUsage()).toHaveLength(24);
    expect(budgetFor('w30_8')?.runId).toBe('trace_archon__w30_8__5000');
    expect(budgetFor('w30_6')?.actionCount).toBeGreaterThan(0);
    expect(budgetFor('w30_7')?.actionCount).toBeGreaterThan(0);
    expect(getSimulatedTimeline('single-target-priority')?.phases).toHaveLength(3);
    expect(getSimulatedTimeline('mid-wave')?.phases).toHaveLength(3);
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
  it('默认专精只有 Archon 开放，其余返回空章节与空 run 列表', () => {
    expect(findSpec(DEFAULT_SPEC)?.status).toBe('active');
    expect(hasContent(DEFAULT_SPEC)).toBe(true);
    expect(findSpec('shadow-priest')?.heroTrees).toEqual([
      expect.objectContaining({ id: 'archon', status: 'active' }),
      expect.objectContaining({ id: 'voidweaver', status: 'planned' }),
    ]);
    expect(chaptersFor(DEFAULT_SPEC)).toHaveLength(11);
    expect(SPECS.find((spec) => spec.status === 'planned')).toBeDefined();
    expect(chaptersFor('devourer')).toEqual([]);
    expect(allRuns('devourer')).toEqual([]);
  });
});
