/**
 * 门禁自检：证明 validate:content、check:ui、check:design 真会变红。
 *
 * 只读仓库内容；坏样本放在系统临时目录。
 *   1. valid negative: 图契约减一段 → validate 必须失败并点名「图契约必须有 5 段」
 *   2. valid positive: 原图契约 → validate 必须通过
 *   3. UI negative: 构建产物把 play-budget 类型改坏 → check:ui 必须失败并点名有图段未渲染
 *   4. UI positive: 原构建产物 → check:ui 必须通过
 *   5. design negative: ui.css 注入离阶间距 + 中文标签正字距 + token 块外色值
 *      → check:design 必须失败并逐条点名（改完必须还原）
 *   6. design positive: 还原后的 ui.css → check:design 必须通过
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
