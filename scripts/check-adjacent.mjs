/**
 * 相邻交换数据门：content/analysis/adjacent-archon.json 必须能被原始 sim 记录复核。
 *
 * 查三件事：
 *   1. 每个 runId 都真实存在，且 hero / profileId / 基础 profile 指纹对得上；
 *   2. 每对差值、误差上限、判定，都能从两条 sim 记录重算出来（不是手填）；
 *   3. 组级结论与逐场景结论一致，攻略源章节确实存在。
 *
 * 用法：
 *   node scripts/check-adjacent.mjs
 *   node scripts/check-adjacent.mjs --analysis=<path> --sims=<dir>
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateReps, groupVerdict, guideMatch, pairVerdict, PAIR_FIELDS, SAMPLE_TOLERANCE } from './adjacent-swap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? resolve(ROOT, eq.slice(name.length + 3)) : fallback;
};

const DELTA_TOLERANCE = 0.01;
const SCENARIOS = ['st', 't3', 'add5', 'w30_8'];

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function loadSims(dir) {
  const map = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'numeric-summary.json') continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (j?.runId) map.set(j.runId, j);
    } catch {
      // 别的门禁负责报坏文件
    }
  }
  return map;
}

export function checkAdjacent(analysis, sims, chapterIds) {
  const errors = [];
  const push = (msg) => errors.push(msg);

  if (!isRecord(analysis)) return ['adjacent-archon.json 必须是对象'];
  for (const key of ['hero', 'profileId', 'profileFile', 'profileSha256']) {
    if (!analysis[key]) push(`adjacent.${key}：缺失`);
  }
  if (!isRecord(analysis.simc) || !analysis.simc.version || !analysis.simc.gitRevision) {
    push('adjacent.simc：必须记录 version 与 gitRevision');
  }
  if (!Array.isArray(analysis.groups) || analysis.groups.length === 0) {
    push('adjacent.groups：不能为空');
    return errors;
  }
  if (!Array.isArray(analysis.runs) || analysis.runs.length === 0) push('adjacent.runs：runId 清单不能为空');

  const baseSha = analysis.profileSha256;
  const seen = new Set();

  const checkPair = (label, pair) => {
    if (!isRecord(pair)) {
      push(`${label}：配对必须是对象`);
      return null;
    }
    const before = sims.get(pair.beforeRunId);
    const after = sims.get(pair.afterRunId);
    for (const [side, id, rec] of [['before', pair.beforeRunId, before], ['after', pair.afterRunId, after]]) {
      if (!rec) {
        push(`${label}.${side}RunId：${id ?? '缺失'} 在 content/sims 里不存在`);
        return null;
      }
      seen.add(id);
      if (rec.kind !== 'adjacent-swap') push(`${label}.${side}RunId：${id} 的 kind 不是 adjacent-swap`);
      if (rec.hero !== analysis.hero) push(`${label}.${side}RunId：${id} 的 hero 是 ${rec.hero}，与 analysis.hero 不符`);
      if (rec.profileId !== analysis.profileId) push(`${label}.${side}RunId：${id} 的 profileId 不符`);
      if (rec.profileFile !== analysis.profileFile) push(`${label}.${side}RunId：${id} 的 profileFile 不符`);
    }
    if (!before || !after) return null;

    if (before.profileSha256 !== baseSha) {
      push(`${label}.beforeRunId：${before.runId} 的 profile 指纹 ${before.profileSha256} ≠ 批次基础 ${baseSha}`);
    }
    if (after.baseProfileSha256 !== baseSha) {
      push(`${label}.afterRunId：${after.runId} 记录的 baseProfileSha256 与批次基础不一致`);
    }
    if (after.profileSha256 === baseSha) {
      push(`${label}.afterRunId：${after.runId} 与基础 profile 指纹相同，说明交换没写进变体`);
    }

    for (const field of PAIR_FIELDS) {
      if (before[field] !== after[field]) push(`${label}：配对字段 ${field} 不一致（${before[field]} vs ${after[field]}）`);
    }
    const sa = before.dps?.samples;
    const sb = after.dps?.samples;
    if (!finite(sa) || !finite(sb) || sa <= 0 || sb <= 0) {
      push(`${label}：样本数缺失`);
    } else if (Math.abs(sa - sb) / Math.max(sa, sb) > SAMPLE_TOLERANCE) {
      push(`${label}：样本数相差超过 ${SAMPLE_TOLERANCE * 100}%（${sa} vs ${sb}）`);
    }
    if (before.simc?.version !== after.simc?.version || before.simc?.gitRevision !== after.simc?.gitRevision) {
      push(`${label}：SimC 版本或 commit 不一致`);
    }
    if (analysis.simc?.gitRevision && before.simc?.gitRevision !== analysis.simc.gitRevision) {
      push(`${label}：run 的 commit ${before.simc?.gitRevision} 与 analysis 记录的 ${analysis.simc.gitRevision} 不符`);
    }

    const recomputed = pairVerdict(before, after);
    const storedDelta = pair.deltaPct;
    const storedCi = pair.ciPct;
    const recomputedDelta = recomputed.deltaPct == null ? null : Math.round(recomputed.deltaPct * 100) / 100;
    const recomputedCi = recomputed.ciPct == null ? null : Math.round(recomputed.ciPct * 100) / 100;

    if (recomputedDelta == null) {
      if (storedDelta != null) push(`${label}.deltaPct：原始记录算不出差值，却写了 ${storedDelta}`);
    } else if (!finite(storedDelta) || Math.abs(storedDelta - recomputedDelta) > DELTA_TOLERANCE) {
      push(`${label}.deltaPct：写的是 ${storedDelta}，按 runId 重算是 ${recomputedDelta}`);
    }
    if (recomputedCi == null) {
      if (storedCi != null) push(`${label}.ciPct：原始记录算不出误差上限，却写了 ${storedCi}`);
    } else if (!finite(storedCi) || Math.abs(storedCi - recomputedCi) > DELTA_TOLERANCE) {
      push(`${label}.ciPct：写的是 ${storedCi}，按 runId 重算是 ${recomputedCi}`);
    }
    if (pair.verdict !== recomputed.verdict) {
      push(`${label}.verdict：写的是 ${pair.verdict}，按原始记录重算应为 ${recomputed.verdict}`);
    }
    if (recomputed.issues.length && pair.verdict !== 'undetermined') {
      push(`${label}：配对问题未拦住（${recomputed.issues.join('；')}）`);
    }
    return recomputed;
  };

  const checkScenarioBlock = (label, block) => {
    if (!isRecord(block)) {
      push(`${label}：缺少场景结果`);
      return null;
    }
    if (!Array.isArray(block.pairs) || block.pairs.length === 0) {
      push(`${label}.pairs：不能为空`);
      return null;
    }
    for (const pair of block.pairs) checkPair(`${label}.rep${pair?.rep ?? '?'}`, pair);
    const expected = aggregateReps(block.pairs);
    if (block.verdict !== expected) {
      push(`${label}.verdict：写的是 ${block.verdict}，按各次重复重算应为 ${expected}`);
    }
    const deltas = block.pairs.map((p) => p?.deltaPct).filter((d) => finite(d));
    const mean = deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100 : null;
    if (block.deltaPct != null && mean != null && Math.abs(block.deltaPct - mean) > DELTA_TOLERANCE) {
      push(`${label}.deltaPct：写的是 ${block.deltaPct}，按各次重复平均是 ${mean}`);
    }
    return block;
  };

  for (const group of analysis.groups) {
    const label = `group.${group?.id ?? '?'}`;
    if (!group?.id) {
      push('group：缺少 id');
      continue;
    }
    if (!isRecord(group.guideClaim) || !group.guideClaim.chapter) {
      push(`${label}.guideClaim：必须记录对应章节`);
    } else if (chapterIds && !chapterIds.has(group.guideClaim.chapter)) {
      push(`${label}.guideClaim.chapter：${group.guideClaim.chapter} 不是真实章节`);
    }
    if (!group.apl || !Array.isArray(group.apl.before) || !Array.isArray(group.apl.after)) {
      push(`${label}.apl：必须记录交换前后的完整行`);
    } else if (group.apl.before.length !== group.apl.after.length) {
      push(`${label}.apl：交换前后行数不一致`);
    } else {
      const sameText = group.apl.before.map((l) => l.text).sort().join('\n') === group.apl.after.map((l) => l.text).sort().join('\n');
      if (!sameText) push(`${label}.apl：交换前后不是同一组行`);
      const noLineNo = [...group.apl.before, ...group.apl.after].filter((l) => !finite(l?.lineNo));
      if (noLineNo.length) push(`${label}.apl：缺少原始行号`);
    }

    const perScenario = group.perScenario;
    if (!isRecord(perScenario)) {
      push(`${label}.perScenario：缺失`);
      continue;
    }
    for (const id of SCENARIOS) {
      if (!perScenario[id]) push(`${label}.perScenario：缺少场景 ${id}`);
      else checkScenarioBlock(`${label}.${id}`, perScenario[id]);
    }
    const expectedGroup = groupVerdict(perScenario);

    // 结构等价复核：交换的行在基础跑分里是不是 0 次施放，必须能从原始记录重算。
    // 0 次施放的组只能判「无效对照」，不许落进「误差内」——那是「测了没差」，这是「没测到」。
    const swappedSkills = (group.apl?.before ?? [])
      .map((l) => /\/\s*([a-z_0-9]+)/.exec(l?.text ?? '')?.[1])
      .filter(Boolean);
    const inertComputed = swappedSkills.filter((skill) =>
      SCENARIOS.every((id) => {
        const pair = perScenario[id]?.pairs?.[0];
        const rec = pair ? sims.get(pair.beforeRunId) : null;
        return rec?.spellTrace?.[skill]?.executions === 0;
      }),
    );
    const storedInert = group.trace?.inertInAllScenarios;
    if (!Array.isArray(storedInert)) {
      push(`${label}.trace.inertInAllScenarios：缺失，结构等价无法复核`);
    } else if (storedInert.slice().sort().join('|') !== inertComputed.slice().sort().join('|')) {
      push(`${label}.trace.inertInAllScenarios：写的是 [${storedInert.join(', ')}]，按原始记录应为 [${inertComputed.join(', ')}]`);
    }
    const wantedVerdict = inertComputed.length ? 'structurally_inert' : expectedGroup;
    if (group.verdict !== wantedVerdict) {
      push(`${label}.verdict：${group.verdict} 与原始记录应为的 ${wantedVerdict} 不符${inertComputed.length ? `（${inertComputed.join(' / ')} 在四个场景 0 次施放）` : ''}`);
    }

    const meanDelta = (() => {
      const deltas = Object.values(perScenario).map((b) => b?.deltaPct).filter((d) => finite(d));
      return deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
    })();
    const wantedMatch = guideMatch(group.guideClaim?.expectation, group.verdict, meanDelta);
    if (group.guideMatch !== wantedMatch) {
      push(`${label}.guideMatch：写的是 ${group.guideMatch}，按判定 ${group.verdict} 应为 ${wantedMatch}`);
    }
  }

  const positive = analysis.controls?.positive?.perScenario;
  if (!isRecord(positive)) {
    push('adjacent.controls.positive：阳性对照缺失');
  } else {
    for (const id of SCENARIOS) {
      if (!positive[id]) push(`adjacent.controls.positive：缺少场景 ${id}`);
      else checkScenarioBlock(`controls.positive.${id}`, positive[id]);
    }
    const allEffective = SCENARIOS.every((id) => positive[id]?.verdict === 'effective');
    const allNegative = SCENARIOS.every((id) => (positive[id]?.deltaPct ?? 0) < 0);
    if (!allEffective || !allNegative) push('adjacent.controls.positive：阳性对照必须四个场景都判 effective 且为负，否则这套 A/B 不成立');
  }

  const rerun = analysis.controls?.rerun?.perScenario;
  if (!isRecord(rerun)) {
    push('adjacent.controls.rerun：同文本重跑对照缺失');
  } else {
    for (const id of SCENARIOS) {
      const row = rerun[id];
      if (!row) {
        push(`adjacent.controls.rerun：缺少场景 ${id}`);
        continue;
      }
      if (row.verdict !== 'within_noise') push(`adjacent.controls.rerun.${id}：同文本重跑被判成 ${row.verdict}，阈值过松`);
      for (const runId of row.runIds ?? []) {
        if (!sims.has(runId)) push(`adjacent.controls.rerun.${id}：${runId} 不存在`);
      }
    }
  }

  if (analysis.runs && analysis.runs.length !== seen.size) {
    push(`adjacent.runs：清单 ${analysis.runs.length} 条，实际引用 ${seen.size} 条`);
  }
  return errors;
}

function main() {
  const analysisPath = argOf('analysis', resolve(ROOT, 'content', 'analysis', 'adjacent-archon.json'));
  const simsDir = argOf('sims', resolve(ROOT, 'content', 'sims'));
  if (!existsSync(analysisPath)) {
    console.error(`  ✗ 找不到 ${analysisPath}`);
    process.exitCode = 1;
    return;
  }
  const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
  const sims = loadSims(simsDir);
  const chaptersDir = resolve(ROOT, 'content', 'chapters');
  const chapterIds = new Set(
    readdirSync(chaptersDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, '')),
  );
  const errors = checkAdjacent(analysis, sims, chapterIds);

  for (const error of errors) console.error(`  ✗ ${error}`);
  if (errors.length) {
    console.error(`\n相邻交换门禁：${errors.length} 条错误。`);
    process.exitCode = 1;
    return;
  }

  const groups = analysis.groups.map((g) => `${g.id} ${g.verdict}`);
  console.log(`相邻交换：${analysis.groups.length} 组 · ${analysis.runs.length} 个 runId 全部可复核`);
  console.log(`  组结论 ${groups.join(' / ')}`);
  console.log(`  阳性对照 ${SCENARIOS.map((id) => `${id} ${analysis.controls.positive.perScenario[id].deltaPct}%`).join(' / ')}`);
  console.log('\n相邻交换门禁：通过。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
