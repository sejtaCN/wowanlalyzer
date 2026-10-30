/**
 * 读者可见文本审计（报告型，默认不拦截）。
 *
 * 干什么：把构建产物逐页打开，抓「读者会看到的文字」，标出工程口径泄漏——
 * 蛇形标识（skill key / 场景代号 / runId）、字段名（runId、samples）、
 * 图类型（priority-table…）、工程词（构建 / 跑批 / 门禁）、占位符残留、NaN。
 *
 * 口径：**用「」框住的标识符不算问题**——项目规定没出处的中文名一律保留原名并加框，
 * 所以审计先把 「…」 里的内容剥掉再判断。折叠区（`<details>` 未展开）内部也不算，
 * 那是证据区，本来就该放原始写法。
 *
 * 用法：
 *   npm run audit:text           # 报告
 *   npm run audit:text -- --strict   # 有可见问题就 exit 1
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser, launchBrowser } from './browser-launch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const DIST = resolve(argv.find((x) => x.startsWith('--dist='))?.slice(7) ?? resolve(ROOT, 'dist', 'index.html'));

const PATTERNS = [
  ['图类型', /\b(priority-table|burst-bars|skill-cards|log-stats|wave-table|route-strip|selected-wave|phase-chart|play-budget|cooldown-window|target-band)\b/g],
  ['蛇形标识', /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g],
  ['字段名', /\b(runId|runIds|iterations|samples|scenarioId|profileId|logId|kind)\b/g],
  ['工程词', /(批次|门禁|跑批|构建|脚本|工作区)/g],
  ['文件路径', /(\.json|\.mjs|\.simc|content\/|scripts\/)/g],
  ['占位符', /\{\{|\}\}/g],
  ['异常值', /\b(NaN|undefined|null)\b/g],
];

const browserPath = findBrowser();
if (!browserPath) {
  console.error('找不到浏览器：装 Chrome/Edge，或用 CHROME_PATH 指定可执行文件。');
  process.exit(2);
}

const browser = await launchBrowser({
  executablePath: browserPath,
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1100 });
const url = 'file:///' + DIST.replace(/\\/g, '/');

/** 在页面里跑：只取可见文本（未展开的 details 与隐藏元素跳过），先剥掉「」里的标识符 */
const collect = (patterns) => page.evaluate((specs) => {
  const nodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!el) continue;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || box.width === 0) continue;
    if (el.closest('details:not([open])')) continue;
    nodes.push({ text: node.nodeValue ?? '', cls: (el.className || el.tagName).toString().slice(0, 40) });
  }
  const hits = [];
  for (const [name, source] of specs) {
    const re = new RegExp(source, 'g');
    for (const node of nodes) {
      const cleaned = node.text.replace(/「[^」]*」/g, '');
      for (const match of cleaned.matchAll(re)) {
        hits.push({ kind: name, token: match[0], where: node.cls, text: node.text.trim().slice(0, 80) });
      }
    }
  }
  return hits;
}, PATTERNS.map(([name, re]) => [name, re.source]));

const report = [];
await page.goto(url, { waitUntil: 'networkidle0' });
report.push({ label: '首页', hits: await collect(PATTERNS) });

const ids = await page.evaluate(() => [...document.querySelectorAll('button.chap')].map((b) => b.dataset.chapterId));
for (const id of ids) {
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate((chapterId) => document.querySelector(`button.chap[data-chapter-id="${chapterId}"]`)?.click(), id);
  await new Promise((r) => setTimeout(r, 300));
  report.push({ label: `章节 ${id}`, hits: await collect(PATTERNS) });
}

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => [...document.querySelectorAll('button, a')].find((b) => b.innerText?.trim() === '解析台')?.click());
await new Promise((r) => setTimeout(r, 350));
report.push({ label: '解析台（数据面板，标识符属预期）', hits: await collect(PATTERNS) });

await browser.close();

let total = 0;
/** 模拟记录编号（archon__st__5000 / dec_voidform_on_1__w30_8__5000）是数据本身，不是口径泄漏 */
const isRecordId = (token) => token.includes('__') && /^[a-z0-9_]+$/.test(token) && /\d/.test(token);

for (const { label, hits: allHits } of report) {
  const recordIds = allHits.filter((hit) => isRecordId(hit.token));
  const hits = allHits.filter((hit) => !isRecordId(hit.token));
  if (!hits.length) {
    console.log(`✓ ${label}${recordIds.length ? `（记录编号 ${recordIds.length} 处，数据本身）` : ''}`);
    continue;
  }
  const grouped = new Map();
  for (const hit of hits) {
    const key = hit.kind;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(hit);
  }
  console.log(`✗ ${label}：${hits.length} 处`);
  for (const [kind, items] of grouped) {
    const tokens = [...new Set(items.map((item) => item.token))].slice(0, 6).join(' / ');
    console.log(`    ${kind}：${tokens}${items.length > 6 ? ` …（${items.length} 处）` : ''}`);
  }
  total += hits.length;
}

console.log(`\n合计 ${total} 处（「」框住的不计入；解析台是数据面板，标识符属预期）`);
if (STRICT && total > 0) process.exit(1);
