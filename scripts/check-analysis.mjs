/**
 * 分析质量门：配装阳性对照与属性最优化复现校核。
 *
 * 可直接检查当前产物，也可注入样本：
 *   node scripts/check-analysis.mjs
 *   node scripts/check-analysis.mjs --gearing=<path> --stat-opt=<path>
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIOS = ['st', 't3', 't8', 'add5'];
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? resolve(ROOT, hit.slice(prefix.length)) : fallback;
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function checkAnalysis(gearing, statOpt) {
  const errors = [];
  const control = gearing?.control?.perScenario;
  if (!isRecord(control) || Object.keys(control).length === 0) {
    errors.push('gearing.control.perScenario：不能为空，必须覆盖 st / t3 / t8 / add5');
  } else {
    for (const id of SCENARIOS) {
      const row = control[id];
      if (!isRecord(row)) {
        errors.push(`gearing.control.perScenario：缺少场景 ${id}`);
        continue;
      }
      if (!finite(row.deltaPct)) {
        errors.push(`gearing.control.${id}.deltaPct：必须是有限数值`);
      } else if (row.deltaPct > -10) {
        errors.push(`gearing.control.${id}.deltaPct：${row.deltaPct}% 未满足 <= -10%`);
      }
    }
  }

  const perScenario = statOpt?.perScenario;
  if (!isRecord(perScenario) || Object.keys(perScenario).length === 0) {
    errors.push('stat-opt.perScenario：不能为空，必须覆盖 st / t3 / t8 / add5');
  } else {
    for (const id of SCENARIOS) {
      const row = perScenario[id];
      if (!isRecord(row)) {
        errors.push(`stat-opt.perScenario：缺少场景 ${id}`);
        continue;
      }
      const reproduced = row.reproduced;
      if (!isRecord(reproduced) || reproduced.ok !== true || !finite(reproduced.gapPct) || Math.abs(reproduced.gapPct) >= 1) {
        errors.push(
          `stat-opt.${id}.reproduced：ok 必须为 true 且 |gapPct| < 1%（当前 gapPct=${reproduced?.gapPct ?? '缺失'}%）`,
        );
      }
      const absErrorPct = row.optimum?.absErrorPct;
      if (!finite(absErrorPct)) {
        errors.push(`stat-opt.${id}.optimum.absErrorPct：必须是有限数值`);
      } else if (absErrorPct > 2) {
        errors.push(`stat-opt.${id}.optimum.absErrorPct：${absErrorPct}% 超过 2%`);
      }
    }
  }
  return errors;
}

function main() {
  const gearingPath = argOf('gearing', resolve(ROOT, 'content', 'analysis', 'gearing-archon.json'));
  const statOptPath = argOf('stat-opt', resolve(ROOT, 'content', 'analysis', 'stat-opt-archon.json'));
  const gearing = JSON.parse(readFileSync(gearingPath, 'utf8'));
  const statOpt = JSON.parse(readFileSync(statOptPath, 'utf8'));
  const errors = checkAnalysis(gearing, statOpt);

  for (const error of errors) console.error(`  ✗ ${error}`);
  if (errors.length) {
    console.error(`\n分析门禁：${errors.length} 条错误。`);
    process.exitCode = 1;
    return;
  }

  const control = gearing.control.perScenario;
  console.log(`配装阳性对照：${SCENARIOS.map((id) => `${id} ${control[id].deltaPct}%`).join(' / ')}`);
  console.log(
    `属性最优化：${SCENARIOS.map((id) => {
      const row = statOpt.perScenario[id];
      return `${id} 复现差 ${row.reproduced.gapPct}% / 最优误差 ${row.optimum.absErrorPct}%`;
    }).join('；')}`,
  );
  console.log('\n分析门禁：通过（4 个场景均有数据且满足阈值）。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
