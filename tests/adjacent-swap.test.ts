import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-adjacent.mjs');
const ANALYSIS = join(ROOT, 'content', 'analysis', 'adjacent-archon.json');
const TEMP = mkdtempSync(join(ROOT, '.tools', 'tmp', 'adjacent-gate-'));
const analysis = JSON.parse(readFileSync(ANALYSIS, 'utf8'));

/** 脚本是 .mjs（无 .d.ts），用非字面量 specifier 拿 any，避免 tsc 解析类型 */
const loadModule = async () => {
  const url = new URL('../scripts/adjacent-swap.mjs', import.meta.url).href;
  return import(url) as Promise<any>;
};

afterAll(() => {
  rmSync(TEMP, { recursive: true, force: true });
});

function runCase(name: string, mutate: (value: any) => void) {
  const bad = structuredClone(analysis);
  mutate(bad);
  const path = join(TEMP, `${name}.json`);
  writeFileSync(path, JSON.stringify(bad));
  const r = spawnSync(process.execPath, [SCRIPT, `--analysis=${path}`], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

/** 构造一对最小可行记录：只保留判定需要的字段 */
function pair(overrides: Record<string, unknown> = {}) {
  const base = {
    hero: 'archon',
    profileId: 'archon',
    scenarioId: 'st',
    targets: 1,
    durationSec: 300,
    iterations: 5000,
    fightStyle: 'Patchwerk',
    dps: { mean: 200000, ci95Pct: 0.1, samples: 5001 },
    simcVersion: '1210-01',
    simcRevision: '73a372b',
  };
  return { ...base, ...overrides };
}

describe('配对与误差保护', () => {
  it('CI 为 0 或缺失时不出差值结论', async () => {
    const { pairVerdict } = await loadModule();
    const zeroCi = pairVerdict(pair(), pair({ dps: { mean: 210000, ci95Pct: 0, samples: 5000 } }));
    expect(zeroCi.verdict).toBe('undetermined');
    expect(zeroCi.deltaPct).toBeNull();
    const noCi = pairVerdict(pair(), pair({ dps: { mean: 210000, ci95Pct: null, samples: 5000 } }));
    expect(noCi.verdict).toBe('undetermined');
  });

  it('配对元数据不一致时点名字段并拒绝出结论', async () => {
    const { pairVerdict } = await loadModule();
    const r = pairVerdict(pair(), pair({ scenarioId: 't3', dps: { mean: 260000, ci95Pct: 0.1, samples: 5000 } }));
    expect(r.verdict).toBe('undetermined');
    expect(r.issues.join()).toContain('scenarioId');
  });

  it('样本数浮动 1% 以内仍算配对成立，超过就不成立', async () => {
    const { pairVerdict } = await loadModule();
    const ok = pairVerdict(pair(), pair({ dps: { mean: 200500, ci95Pct: 0.1, samples: 4990 } }));
    expect(ok.issues).toHaveLength(0);
    const bad = pairVerdict(pair(), pair({ dps: { mean: 200500, ci95Pct: 0.1, samples: 4500 } }));
    expect(bad.verdict).toBe('undetermined');
    expect(bad.issues.join()).toContain('dps.samples');
  });

  it('差值与误差上限都按口径算：ciOnAbs = on*ci/100，deltaCi = (ciOn+ciOff)/off', async () => {
    const { conservativeDeltaCiPct, pairVerdict } = await loadModule();
    const on = { mean: 200000, ci95Pct: 0.1, samples: 5000 };
    const off = { mean: 100000, ci95Pct: 0.2, samples: 5000 };
    // ciOnAbs = 200, ciOffAbs = 200 → (200+200)/100000*100 = 0.4
    expect(conservativeDeltaCiPct(on, off)).toBeCloseTo(0.4, 10);
    // 差 100% 远超 0.4%，判 effective
    expect(pairVerdict(pair({ dps: off }), pair({ dps: on })).verdict).toBe('effective');
    // 差 0.05% 落在 ±0.12% 内，判 within_noise
    expect(
      pairVerdict(pair(), pair({ dps: { mean: 200100, ci95Pct: 0.1, samples: 5000 } })).verdict,
    ).toBe('within_noise');
  });
});

describe('结论聚合', () => {
  it('只有一次重复有效或单个场景有效，不写成整组有效', async () => {
    const { aggregateReps, groupVerdict } = await loadModule();
    expect(
      aggregateReps([
        { verdict: 'effective', deltaPct: -1 },
        { verdict: 'within_noise', deltaPct: -0.01 },
      ]),
    ).toBe('within_noise');
    expect(groupVerdict({ st: { verdict: 'effective', deltaPct: -1 }, t3: { verdict: 'within_noise' } })).toBe(
      'scenario_specific',
    );
  });

  it('两个场景同号有效才是整组有效，反向则 inconsistent，缺失则 undetermined', async () => {
    const { groupVerdict } = await loadModule();
    expect(
      groupVerdict({
        st: { verdict: 'effective', deltaPct: -1 },
        t3: { verdict: 'effective', deltaPct: -2 },
      }),
    ).toBe('effective');
    expect(
      groupVerdict({
        st: { verdict: 'effective', deltaPct: -1 },
        t3: { verdict: 'effective', deltaPct: 2 },
      }),
    ).toBe('inconsistent');
    expect(
      groupVerdict({ st: { verdict: 'effective', deltaPct: -1 }, t3: { verdict: 'undetermined' } }),
    ).toBe('undetermined');
  });

  it('攻略源对照分四类：支持 / 矛盾 / 证据不足 / 未下结论', async () => {
    const { guideMatch } = await loadModule();
    expect(guideMatch('swap_hurts', 'effective', -3)).toBe('supports');
    expect(guideMatch('swap_hurts', 'effective', 3)).toBe('contradicts');
    expect(guideMatch('swap_hurts', 'within_noise', 0)).toBe('insufficient');
    expect(guideMatch('swap_no_effect', 'within_noise', 0)).toBe('supports');
    expect(guideMatch('swap_no_effect', 'effective', -3)).toBe('contradicts');
    expect(guideMatch('none', 'effective', -3)).toBe('not_claimed');
  });
});

describe('相邻交换数据门', () => {
  it('真实产物全绿：4 组 48 个 runId、阳性对照四场景都为负', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('48 个 runId 全部可复核');
    const positive = analysis.controls.positive.perScenario;
    for (const id of ['st', 't3', 'add5', 'w30_8']) {
      expect(positive[id].verdict).toBe('effective');
      expect(positive[id].deltaPct).toBeLessThan(0);
    }
    expect(analysis.controls.rerun.perScenario.st.verdict).toBe('within_noise');
  });

  it('篡改 deltaPct 会被按 runId 重算抓出来', () => {
    const r = runCase('bad-delta', (a) => {
      a.groups[0].perScenario.st.pairs[0].deltaPct = -0.96;
      a.groups[0].perScenario.st.pairs[0].ciPct = 0.52;
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('deltaPct：写的是 -0.96');
    expect(r.out).toContain('ciPct：写的是 0.52');
  });

  it('引用不存在的 runId 会被点名', () => {
    const r = runCase('bad-run', (a) => {
      a.groups[1].perScenario.t3.pairs[0].afterRunId = 'adj_s2__t3__5000_r9';
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('在 content/sims 里不存在');
  });

  it('阳性对照被判成无效会被点名（证明 A/B 不成立）', () => {
    const r = runCase('bad-control', (a) => {
      a.controls.positive.perScenario.st.pairs.forEach((p: any) => {
        p.verdict = 'within_noise';
      });
      a.controls.positive.perScenario.st.verdict = 'within_noise';
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('阳性对照必须四个场景都判 effective');
  });
});
