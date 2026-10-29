import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-analysis.mjs');
const TEMP = mkdtempSync(join(ROOT, '.tools', 'tmp', 'analysis-gate-'));
const gearing = JSON.parse(readFileSync(join(ROOT, 'content', 'analysis', 'gearing-archon.json'), 'utf8'));
const statOpt = JSON.parse(readFileSync(join(ROOT, 'content', 'analysis', 'stat-opt-archon.json'), 'utf8'));

afterAll(() => {
  rmSync(TEMP, { recursive: true, force: true });
});

function runCase(name: string, mutateGearing?: (value: any) => void, mutateStatOpt?: (value: any) => void) {
  const badGearing = structuredClone(gearing);
  const badStatOpt = structuredClone(statOpt);
  mutateGearing?.(badGearing);
  mutateStatOpt?.(badStatOpt);
  const gearingPath = join(TEMP, `${name}-gearing.json`);
  const statOptPath = join(TEMP, `${name}-stat-opt.json`);
  writeFileSync(gearingPath, JSON.stringify(badGearing));
  writeFileSync(statOptPath, JSON.stringify(badStatOpt));
  const result = spawnSync(process.execPath, [SCRIPT, `--gearing=${gearingPath}`, `--stat-opt=${statOptPath}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { result, output: `${result.stdout}\n${result.stderr}` };
}

describe('分析质量门', () => {
  it('当前真实产物全绿并报告四场景数值', () => {
    const { result, output } = runCase('real');
    expect(output).toContain('st -20.05%');
    expect(output).toContain('add5 -17.2%');
    expect(output).toContain('最优误差 1.19%');
    expect(result.status, output).toBe(0);
  });

  it('空阳性对照、缺场景和 -5% 对照全部变红并点名', () => {
    const empty = runCase('empty-control', (value) => {
      value.control.perScenario = {};
    });
    expect(empty.result.status).not.toBe(0);
    expect(empty.output).toContain('gearing.control.perScenario：不能为空');

    const missing = runCase('missing-control', (value) => {
      delete value.control.perScenario.t8;
    });
    expect(missing.result.status).not.toBe(0);
    expect(missing.output).toContain('缺少场景 t8');

    const weak = runCase('weak-control', (value) => {
      value.control.perScenario.st.deltaPct = -5;
    });
    expect(weak.result.status).not.toBe(0);
    expect(weak.output).toContain('gearing.control.st.deltaPct：-5% 未满足 <= -10%');
  });

  it('1.5% 复现差与 3% 最优误差全部变红并点名', () => {
    const gap = runCase('repro-gap', undefined, (value) => {
      value.perScenario.st.reproduced.gapPct = 1.5;
    });
    expect(gap.result.status).not.toBe(0);
    expect(gap.output).toContain('stat-opt.st.reproduced');
    expect(gap.output).toContain('gapPct=1.5%');

    const optimum = runCase('optimum-error', undefined, (value) => {
      value.perScenario.t3.optimum.absErrorPct = 3;
    });
    expect(optimum.result.status).not.toBe(0);
    expect(optimum.output).toContain('stat-opt.t3.optimum.absErrorPct：3% 超过 2%');
  });
});
