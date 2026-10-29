import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  allRuns,
  ARCHON_PROFILE_ID,
  burstPairs,
  burstPairFromRuns,
  budgetFor,
  conservativeDeltaCiPct,
  CHAPTERS,
  chaptersFor,
  chapterRoute,
  FIGURES,
  getPhases,
  getRun,
  getSimulatedTimeline,
  isComparableRunPair,
  LEVERAGE,
  prioritySections,
  ROUTE_DUNGEONS,
  ROUTE_SUMMARY,
  routeFor,
  skillUsage,
} from '../apps/web/src/data/content';
import { DEFAULT_SPEC, findSpec, hasContent, SPECS } from '../apps/web/src/data/specs';
import { burstValueFor } from '../apps/web/src/components/Teaching/rules';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 祭牙祭坛是当前唯一登记的路线；换副本时这里跟着换 slug。 */
const ALTAR = routeFor('altar_of_fangs')!;

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
    expect(CHAPTERS).toHaveLength(12);
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

  it('路线按副本取，缺数据时不拿别的副本顶', () => {
    expect(ROUTE_DUNGEONS).toEqual(['altar_of_fangs', 'ruby_life_pools']);
    expect(routeFor('altar_of_fangs')?.routePublicKey).toBe('xwt8Pza');
    // 未登记的副本返回 null，不静默回落到已有路线。
    expect(routeFor('the_blinding_vale')).toBeNull();
    expect(routeFor(undefined)).toBeNull();

    // L2 只认自己副本：章节声明哪个副本就必须拿到哪个副本的路线。
    const l2 = CHAPTERS.filter((chapter) => chapter.level === 'L2');
    expect(l2.length).toBeGreaterThan(0);
    for (const chapter of l2) {
      const route = chapterRoute(chapter);
      expect(route?.routePublicKey).toBe(routeFor(chapter.map?.dungeon)?.routePublicKey ?? null);
    }

    // L1 有绑定的用绑定，没绑定的借示例路线；两者都必须拿到可展示的波次。
    for (const chapter of CHAPTERS.filter((item) => item.level === 'L1')) {
      expect(chapterRoute(chapter)?.waves.length ?? 0).toBeGreaterThan(0);
    }

    // 汇总与注册表一致，首页状态条读的就是它。
    expect(ROUTE_SUMMARY).toEqual({ routes: 2, pulls: 27, mobs: 184 });

    // 第二条路线：红玉新生池 12 波 / 76 只 / 554 forces，与 keystone 路线页一致。
    const ruby = routeFor('ruby_life_pools')!;
    expect(ruby.pulls).toBe(12);
    expect(ruby.totalMobs).toBe(76);
    expect(ruby.totalForces).toBe(554);
    expect(ruby.requiredForces).toBe(551);
    expect(ruby.waves.reduce((sum, wave) => sum + wave.forces, 0)).toBe(554);
    // 每波的目标档都必须在已跑过的模拟里有配对，否则会静默不出数。
    for (const wave of ruby.waves) {
      if (wave.scenarioId == null) continue;
      expect(getRun(`dec_voidform_on_1__${wave.scenarioId}__5000`)).toBeTruthy();
      expect(getRun(`dec_voidform_on_0__${wave.scenarioId}__5000`)).toBeTruthy();
    }
  });

  it('保留图契约、路线、日志和优先级数据', () => {
    const figures = Object.values(FIGURES).flat();
    expect(figures.filter((figure) => figure.status === 'ready')).toHaveLength(54);
    // 红玉新生池第⑤段没有真人日志：缺图必须显式标 missing，不能拿模拟或别的副本顶。
    expect(figures.filter((figure) => figure.status === 'missing')).toHaveLength(1);
    expect(figures.filter((figure) => figure.status === 'not-applicable')).toHaveLength(5);

    expect(ALTAR.pulls).toBe(15);
    expect(ALTAR.waves).toHaveLength(15);
    expect(ALTAR.totalForces).toBe(825);
    expect(ALTAR.requiredForces).toBe(817);
    expect(ALTAR.routePublicKey).toBe('xwt8Pza');
    expect(ALTAR.waves.every((wave) => wave.enemyIds?.length === wave.mobCount)).toBe(true);
    expect(ALTAR.waves.reduce((sum, wave) => sum + wave.forces, 0)).toBe(825);
    // 空波次：既没有场景，也不出任何数值。
    const emptyWave = ALTAR.waves.find((item) => item.pull === 12)!;
    expect(emptyWave.mobCount).toBe(0);
    expect(emptyWave.scenarioId).toBeNull();
    const emptyValue = burstValueFor(emptyWave, getRun);
    expect(emptyValue.reason).toBe('empty');
    expect(emptyValue.deltaPct).toBeNull();
    expect(emptyValue.approximation).toBeNull();

    // BOSS 混小怪：按全场目标数近似，必须带 approximation 标记，数值来自真实配对 runId。
    for (const [pull, scenarioId, simulatedTargets] of [[10, 'w30_8', 8], [15, 'w30_7', 7]] as const) {
      const wave = ALTAR.waves.find((item) => item.pull === pull)!;
      expect(wave.scenarioId).toBe(scenarioId);
      expect(wave.approximation?.kind).toBe('desired-targets');
      expect(wave.approximation?.actualMobs).toBe(wave.mobCount);
      expect(wave.approximation?.simulatedTargets).toBe(simulatedTargets);
      const value = burstValueFor(wave, getRun);
      expect(value.reason).toBeNull();
      expect(value.approximation?.simulatedTargets).toBe(simulatedTargets);
      expect(value.deltaPct).not.toBeNull();
      expect(value.onRunId).toBe(`dec_voidform_on_1__${scenarioId}__5000`);
      expect(value.offRunId).toBe(`dec_voidform_on_0__${scenarioId}__5000`);
    }

    // 没有近似档的 BOSS 混小怪仍必须拦截，防止新路线静默出数。
    const bareMixed = { mobCount: 9, isBoss: true, trashMobCount: 8, scenarioId: null, approximation: null };
    expect(burstValueFor(bareMixed, getRun).reason).toBe('mixed-boss');
    expect(burstValueFor(bareMixed, getRun).deltaPct).toBeNull();
    expect(ALTAR.waves.find((wave) => wave.pull === 12)?.mobCount).toBe(0);
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

  it('差值统一使用保守误差上限，并拒绝元数据或 CI 不完整的配对', () => {
    const on = getRun('dec_voidform_on_1__w30_8__5000')!;
    const off = getRun('dec_voidform_on_0__w30_8__5000')!;
    const expected = (on.dps * on.ci95Pct! / 100 + off.dps * off.ci95Pct! / 100) / off.dps * 100;
    expect(conservativeDeltaCiPct(on, off)).toBeCloseTo(expected, 10);
    expect(burstPairFromRuns(on, off)?.ciPct).toBeCloseTo(expected, 10);
    expect(isComparableRunPair(on, off)).toBe(true);

    for (const mutate of [
      (run: typeof on) => { run.samples = 1; },
      (run: typeof on) => { run.durationSec = 31; },
      (run: typeof on) => { run.targets = 7; },
      (run: typeof on) => { run.profileId = 'other'; },
      (run: typeof on) => { run.scenarioId = 'other'; },
      (run: typeof on) => { run.simc = { ...run.simc!, commit: 'other' }; },
      (run: typeof on) => { run.simc = { ...run.simc!, version: 'other' }; },
    ]) {
      const changed = structuredClone(on);
      mutate(changed);
      expect(burstPairFromRuns(changed, off)).toBeNull();
    }
    for (const ci95Pct of [null, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(burstPairFromRuns({ ...on, ci95Pct }, off)).toBeNull();
      expect(burstPairFromRuns(on, { ...off, ci95Pct })).toBeNull();
    }
    expect(LEVERAGE.rows.every((row) => row.deltaCiPct != null && row.beyondCi != null)).toBe(true);
    expect(CHAPTERS.filter((chapter) => chapter.claim).map((chapter) => chapter.id)).toEqual(['l1-04-boss']);
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
    expect(chaptersFor(DEFAULT_SPEC)).toHaveLength(12);
    expect(SPECS.find((spec) => spec.status === 'planned')).toBeDefined();
    expect(chaptersFor('devourer')).toEqual([]);
    expect(allRuns('devourer')).toEqual([]);
  });
});
