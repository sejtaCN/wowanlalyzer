/**
 * 门禁自检：证明 validate:content、check:ui、check:design 真会变红。
 *
 * 只读仓库内容；坏样本放在系统临时目录。
 *   1. valid negative: 图契约减一段 → validate 必须失败并点名「图契约必须有 5 段」
 *   2. valid positive: 原图契约 → validate 必须通过
 *   3. UI negative: 构建产物把 play-budget 类型改坏 → check:ui 必须失败并点名有图段未渲染
 *   4. UI negative: 删掉 L1-02 的 evidence-raw → check:ui 必须点名原始记录折叠缺失
 *   5. UI negative: 给 L1-02 第五段读法注入反引号 → check:ui 必须点名 Markdown
 *   6. UI positive: 原构建产物 → check:ui 必须通过
 *   7. design negative: ui.css 注入离阶间距 + 中文标签正字距 + token 块外色值
 *      → check:design 必须失败并逐条点名（改完必须还原）
 *   8. design positive: 还原后的 ui.css → check:design 必须通过
 *   9–14. analysis: 真实产物通过；空对照 / 缺场景 / 弱对照 / 复现差 / 最优误差分别变红
 *   15–19. adjacent: 真实交换数据通过；改差值 / 假 runId / 阳性对照被杀 / 无效对照改回误差内分别变红
 *   20–23. copy: 真实文案通过；比较句 / 纯英文机器串 / 可见 JSON 的坏样本按诊断文本点名
 *
 * 用法：npm run verify:gates
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'wowa-gate-'));
const runs = [];

const run = (label, cmd, args, expectPass, mustContain) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const passed = expectPass ? r.status === 0 : r.status !== 0;
  const named = !mustContain || out.includes(mustContain);
  const ok = passed && named;
  runs.push({ label, ok, status: r.status, named, out });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${mustContain ? `（${mustContain}）` : ''}`);
  return { ok, out };
};

try {
  // ---- validate:content ----
  const contractPath = join(ROOT, 'content', 'figures', 'chapters.json');
  const doc = JSON.parse(readFileSync(contractPath, 'utf8'));
  doc.chapters['l1-02-large'] = doc.chapters['l1-02-large'].slice(0, 4);
  const badContract = join(temp, 'figures-bad.json');
  writeFileSync(badContract, JSON.stringify(doc, null, 2));

  run('validate 正样本', process.execPath, ['scripts/validate-content.mjs'], true);
  run('validate 负样本：五段图契约被删一段', process.execPath, [
    'scripts/validate-content.mjs',
    `--check-figures=${badContract}`,
  ], false, '图契约必须有 5 段');

  // ---- check:ui ----
  const badDistDir = join(temp, 'dist-bad');
  const shotsBad = join(temp, 'shots-bad');
  cpSync(join(ROOT, 'dist'), badDistDir, { recursive: true });
  const index = join(badDistDir, 'index.html');
  const src = readFileSync(index, 'utf8');
  const mutated = src.split('play-budget').join('play-budget-broken');
  if (mutated === src) throw new Error('构建产物里找不到 play-budget，无法做 UI 负样本');
  writeFileSync(index, mutated);

  const evidenceBadDir = join(temp, 'dist-evidence-bad');
  cpSync(join(ROOT, 'dist'), evidenceBadDir, { recursive: true });
  const evidenceIndex = join(evidenceBadDir, 'index.html');
  const evidenceSrc = readFileSync(evidenceIndex, 'utf8');
  const evidenceMutated = evidenceSrc.split('evidence-raw').join('evidence-raw-broken');
  if (evidenceMutated === evidenceSrc) {
    throw new Error('构建产物里找不到 evidence-raw，无法做原始记录负样本');
  }
  writeFileSync(evidenceIndex, evidenceMutated);

  const markdownBadDir = join(temp, 'dist-markdown-bad');
  cpSync(join(ROOT, 'dist'), markdownBadDir, { recursive: true });
  const markdownIndex = join(markdownBadDir, 'index.html');
  const markdownSrc = readFileSync(markdownIndex, 'utf8');
  const l102 = JSON.parse(readFileSync(join(ROOT, 'content', 'chapters', 'l1-02-large.json'), 'utf8'));
  const reading = l102.casePanel.reading;
  const markdownMutated = markdownSrc.replace(reading, `\`${reading}`);
  if (markdownMutated === markdownSrc) {
    throw new Error('构建产物里找不到 L1-02 读法，无法做 Markdown 负样本');
  }
  writeFileSync(markdownIndex, markdownMutated);

  run('UI 正样本：11 章 + 解析台 + 骨架页', process.execPath, [
    'scripts/check-ui.mjs',
    `--dist=${join(ROOT, 'dist', 'index.html')}`,
    `--shots=${join(temp, 'shots-ok')}`,
  ], true, '11 章逐章检查');
  run('UI 负样本：有图段的动作预算被改坏', process.execPath, [
    'scripts/check-ui.mjs',
    `--dist=${index}`,
    `--shots=${shotsBad}`,
  ], false, 'DOM 未渲染对应图');
  run('UI 负样本：L1-02 原始记录折叠被破坏', process.execPath, [
    'scripts/check-ui.mjs',
    `--dist=${evidenceIndex}`,
    `--shots=${join(temp, 'shots-evidence-bad')}`,
  ], false, '缺少原始记录折叠');
  run('UI 负样本：L1-02 读法注入反引号', process.execPath, [
    'scripts/check-ui.mjs',
    `--dist=${markdownIndex}`,
    `--shots=${join(temp, 'shots-markdown-bad')}`,
  ], false, '可见文本含 Markdown 标记');

  // ---- check:analysis ----
  const gearing = JSON.parse(readFileSync(join(ROOT, 'content', 'analysis', 'gearing-archon.json'), 'utf8'));
  const statOpt = JSON.parse(readFileSync(join(ROOT, 'content', 'analysis', 'stat-opt-archon.json'), 'utf8'));
  const analysisCase = (name, mutateGearing, mutateStatOpt) => {
    const g = structuredClone(gearing);
    const s = structuredClone(statOpt);
    mutateGearing?.(g);
    mutateStatOpt?.(s);
    const gearingPath = join(temp, `${name}-gearing.json`);
    const statOptPath = join(temp, `${name}-stat-opt.json`);
    writeFileSync(gearingPath, JSON.stringify(g));
    writeFileSync(statOptPath, JSON.stringify(s));
    return [`--gearing=${gearingPath}`, `--stat-opt=${statOptPath}`];
  };
  run('analysis 正样本：真实配装与属性产物', process.execPath, [
    'scripts/check-analysis.mjs',
  ], true, '分析门禁：通过');
  run('analysis 负样本：空阳性对照', process.execPath, [
    'scripts/check-analysis.mjs',
    ...analysisCase('empty-control', (g) => { g.control.perScenario = {}; }),
  ], false, 'gearing.control.perScenario：不能为空');
  run('analysis 负样本：阳性对照缺一个场景', process.execPath, [
    'scripts/check-analysis.mjs',
    ...analysisCase('missing-control', (g) => { delete g.control.perScenario.t8; }),
  ], false, '缺少场景 t8');
  run('analysis 负样本：阳性对照只有 -5%', process.execPath, [
    'scripts/check-analysis.mjs',
    ...analysisCase('weak-control', (g) => { g.control.perScenario.st.deltaPct = -5; }),
  ], false, 'gearing.control.st.deltaPct：-5% 未满足 <= -10%');
  run('analysis 负样本：属性复现差 1.5%', process.execPath, [
    'scripts/check-analysis.mjs',
    ...analysisCase('repro-gap', null, (s) => { s.perScenario.st.reproduced.gapPct = 1.5; }),
  ], false, 'gapPct=1.5%');
  run('analysis 负样本：最优预测误差 3%', process.execPath, [
    'scripts/check-analysis.mjs',
    ...analysisCase('optimum-error', null, (s) => { s.perScenario.t3.optimum.absErrorPct = 3; }),
  ], false, 'stat-opt.t3.optimum.absErrorPct：3% 超过 2%');

  // ---- check:adjacent ----
  const adjacent = JSON.parse(readFileSync(join(ROOT, 'content', 'analysis', 'adjacent-archon.json'), 'utf8'));
  const adjacentCase = (name, mutate) => {
    const a = structuredClone(adjacent);
    mutate(a);
    const p = join(temp, `${name}-adjacent.json`);
    writeFileSync(p, JSON.stringify(a));
    return [`--analysis=${p}`];
  };
  run('adjacent 正样本：4 组交换逐项可复核', process.execPath, [
    'scripts/check-adjacent.mjs',
  ], true, '全部可复核');
  run('adjacent 负样本：手改 deltaPct', process.execPath, [
    'scripts/check-adjacent.mjs',
    ...adjacentCase('tampered-delta', (a) => {
      a.groups[0].perScenario.st.pairs[0].deltaPct = -0.96;
    }),
  ], false, 'deltaPct：写的是 -0.96');
  run('adjacent 负样本：引用不存在的 runId', process.execPath, [
    'scripts/check-adjacent.mjs',
    ...adjacentCase('missing-run', (a) => {
      a.groups[1].perScenario.t3.pairs[0].afterRunId = 'adj_s2__t3__5000_r9';
    }),
  ], false, '在 content/sims 里不存在');
  run('adjacent 负样本：阳性对照被判成无效', process.execPath, [
    'scripts/check-adjacent.mjs',
    ...adjacentCase('dead-control', (a) => {
      a.controls.positive.perScenario.st.verdict = 'within_noise';
      a.controls.positive.perScenario.st.pairs.forEach((p) => { p.verdict = 'within_noise'; });
    }),
  ], false, '阳性对照必须四个场景都判 effective');
  run('adjacent 负样本：把无效对照改回「误差内」', process.execPath, [
    'scripts/check-adjacent.mjs',
    ...adjacentCase('inert-back-to-noise', (a) => {
      const s2 = a.groups.find((g) => g.id === 's2');
      s2.verdict = 'within_noise';
      s2.guideMatch = 'insufficient';
    }),
  ], false, '与原始记录应为的 structurally_inert 不符');

  // ---- check:design ----
  // 它跑源码，负样本必须临时改 ui.css，用完必须还原。
  const cssPath = join(ROOT, 'apps', 'web', 'src', 'ui.css');
  const cssOriginal = readFileSync(cssPath, 'utf8');
  try {
    const anchor = '.model-grid { display: grid;';
    if (!cssOriginal.includes(anchor)) throw new Error('ui.css 里找不到注入锚点，无法做设计负样本');
    const injected = cssOriginal.replace(
      anchor,
      [
        '.probe-gap { gap: 11px; }',
        '.probe-ls { letter-spacing: 0.1em; }',
        '.probe-uc { text-transform: uppercase; }',
        '.probe-color { color: #ff0000; }',
        anchor,
      ].join('\n'),
    );
    writeFileSync(cssPath, injected);

    run('design 负样本：离阶间距 + 正字距 + uppercase + token 块外色值', process.execPath, [
      'scripts/check-design.mjs',
    ], false, '不在间距阶');
  } finally {
    writeFileSync(cssPath, cssOriginal);
  }
  run('design 正样本：还原后的 ui.css', process.execPath, [
    'scripts/check-design.mjs',
  ], true, '设计门禁：0 条错误');

  // ---- check:copy ----
  run('copy 正样本：真实文案且 ComingSoon 单列延期', process.execPath, [
    'scripts/check-copy.mjs',
  ], true, 'deferred: ComingSoon');

  const appPath = join(ROOT, 'apps', 'web', 'src', 'App.tsx');
  const appOriginal = readFileSync(appPath, 'utf8');
  try {
    writeFileSync(appPath, `${appOriginal}\nexport const COPY_GATE_COMPARISON_PROBE = <span>{'两波间隔 <122.4s；我们'}</span>;\n`);
    run('copy 负样本：App.tsx 含 < 的比较句进入提醒通道', process.execPath, [
      'scripts/check-copy.mjs',
    ], true, 'apps/web/src/App.tsx · tsx string：出现 AI 腔词「我们」');
  } finally {
    writeFileSync(appPath, appOriginal);
  }

  const sourcesPath = join(ROOT, 'apps', 'web', 'src', 'components', 'Sources.tsx');
  const sourcesOriginal = readFileSync(sourcesPath, 'utf8');
  try {
    writeFileSync(sourcesPath, `${sourcesOriginal}\nexport const COPY_GATE_MACHINE_PROBE = <span>{'sims-run.mjs'}</span>;\n`);
    run('copy 负样本：纯英文机器字符串被点名', process.execPath, [
      'scripts/check-copy.mjs',
    ], true, 'apps/web/src/components/Sources.tsx · tsx string：出现禁用词「.mjs」');
  } finally {
    writeFileSync(sourcesPath, sourcesOriginal);
  }

  const coachingPath = join(ROOT, 'content', 'coaching', 'general.json');
  const coachingOriginal = readFileSync(coachingPath, 'utf8');
  try {
    const coaching = JSON.parse(coachingOriginal);
    coaching.title += ' 我们';
    writeFileSync(coachingPath, JSON.stringify(coaching, null, 2));
    run('copy 负样本：可见 coaching JSON 被点名', process.execPath, [
      'scripts/check-copy.mjs',
    ], true, 'content/coaching/general.json · title：出现 AI 腔词「我们」');
  } finally {
    writeFileSync(coachingPath, coachingOriginal);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const failed = runs.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n门禁自检失败 ${failed.length} 条：`);
  failed.forEach((r) => console.error(`  · ${r.label}\n${r.out.slice(-1200)}`));
  process.exit(1);
}
console.log(`\n门禁自检通过：${runs.length}/${runs.length}（正样本绿、坏样本红）`);
