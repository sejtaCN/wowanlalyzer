/**
 * 界面门禁：逐章检查真实 DOM，不靠肉眼。
 *
 * 断言：
 *   1. 字号只有四档（30 / 21 / 14 / 12），内容宽 720、段内间距 14
 *   2. 11 章全部能打开，每章 = 顶图带 3 格 + 五段，每段有标题和一句说明
 *   3. 图契约标为 ready 的段，DOM 里必须真的有对应图/表；missing 只警告，
 *      not-applicable 不要求图。这样「有子元素」不再等于「这一段有图」。
 *   4. 解析台纵向六段、无 tab；未实装专精仍有流水线 + 3 张灰模
 *   5. 全程无 JS 错误；file:// 直接打开
 *
 * 用法：
 *   node scripts/check-ui.mjs
 *   node scripts/check-ui.mjs --dist=<index.html> --shots=<目录>
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argOf = (name, fallback) => {
  const hit = process.argv.find((x) => x.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DIST = resolve(argOf('dist', join(ROOT, 'dist', 'index.html')));
const SHOTS = resolve(argOf('shots', join(ROOT, '.tools', 'tmp', 'ui')));
const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const BROWSER = BROWSER_CANDIDATES.find((path) => existsSync(path));
const CHAPTERS_DIR = join(ROOT, 'content', 'chapters');
const FIGURES = JSON.parse(readFileSync(join(ROOT, 'content', 'figures', 'chapters.json'), 'utf8'));

const FS_OK = new Set(['30px', '21px', '14px', '12px']);
const fails = [];
const warnings = [];
const check = (cond, msg) => {
  if (!cond) fails.push(msg);
};

if (!existsSync(DIST)) {
  console.error(`没有构建产物：${DIST} —— 先 npm run build`);
  process.exit(1);
}
if (!BROWSER) {
  console.error('找不到 Chrome / Edge / Chromium。');
  console.error('安装浏览器后重试，或通过 CHROME_PATH 指定可执行文件。');
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const VISUALS = {
  scope: '.scope-figure',
  'target-band': '[data-figure-kind="target-band"]',
  'play-budget': '[data-figure-kind="play-budget"] .pb-bar, [data-figure-kind="play-budget"] .pb-res svg',
  'cooldown-window': '[data-figure-kind="cooldown-window"] .cw-track',
  'decision-flow': '.df[data-figure-kind="decision-flow"] .df-step',
  'burst-bars': '.bars .grp',
  'priority-table': 'table.tbl',
  'skill-cards': '.skills .sk',
  'log-stats': '.kpis .v',
  'priority-map': '[data-figure-kind="priority-map"]',
  'route-examples': '.pulls .p, .wavediag .wd-row',
  'route-strip': '.route-wave',
  'route-map': '[data-figure-kind="route-map"] img, [data-figure-kind="route-map"] .map-current',
  'selected-wave': '[data-figure-kind="selected-wave"] .sw-bars',
  'wave-table': 'table.tbl',
  'phase-chart': '.tbl-ph, .btl svg',
  'cast-chart': '[data-figure-kind="cast-chart"]',
  'budget-chart': '[data-figure-kind="budget-chart"]',
  'resource-chart': '[data-figure-kind="resource-chart"]',
  'mechanic-cost': '[data-figure-kind="mechanic-cost"]',
};

const chapters = readdirSync(CHAPTERS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(CHAPTERS_DIR, f), 'utf8')))
  .sort((a, b) => a.level.localeCompare(b.level) || a.order - b.order);

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: 'new',
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage();
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') jsErrors.push(m.text());
});
await page.setViewport({ width: 1280, height: 1200 });
await page.goto(`file:///${DIST.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

const fontSizesIn = (sel) =>
  page.evaluate((s) => {
    const root = s ? document.querySelector(s) : document.body;
    const out = new Set();
    root.querySelectorAll('*').forEach((el) => {
      if (el.closest('svg')) return;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText) out.add(getComputedStyle(el).fontSize);
    });
    return [...out];
  }, sel);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const goHome = async () => {
  await page.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.trim() === '学习')?.click());
  await sleep(220);
};

// ---- 首页 ----
const homeSizes = await fontSizesIn('.page');
homeSizes.forEach((s) => check(FS_OK.has(s), `首页出现了四档之外的字号：${s}`));
const pageWidth = await page.evaluate(() => Math.round(document.querySelector('.page').getBoundingClientRect().width));
check(pageWidth === 720, `内容宽应为 720，实际 ${pageWidth}`);
await page.screenshot({ path: `${SHOTS}/home.png` });

// ---- 11 章逐章 ----
for (const chapter of chapters) {
  await goHome();
  const clicked = await page.evaluate((id) => {
    const b = document.querySelector(`button.chap[data-chapter-id="${id}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, chapter.id);
  await sleep(240);
  check(clicked, `${chapter.id}: 首页找不到该章入口`);
  if (!clicked) continue;

  const h1 = await page.evaluate(() => document.querySelector('.page h1')?.textContent?.trim() ?? '');
  check(h1 === chapter.title, `${chapter.id}: 打开后标题「${h1}」与内容「${chapter.title}」不一致`);

  const obs = await page.evaluate((selectors) => ({
    width: Math.round(document.querySelector('.page').getBoundingClientRect().width),
    topband: document.querySelectorAll('.topband .tb-cell').length,
    sections: [...document.querySelectorAll('.sec')].map((s) => {
      const fig = s.querySelector('.sec-fig');
      return {
        question: s.querySelector('h2')?.textContent?.trim() ?? '',
        note: !!s.querySelector('.sec-note')?.textContent?.trim(),
        children: fig?.children.length ?? 0,
        kind: s.dataset.figureKind ?? '',
        status: s.dataset.figureStatus ?? '',
        gap: fig ? getComputedStyle(fig).gap : null,
        visuals: Object.fromEntries(selectors.map(([k, sel]) => [k, s.querySelectorAll(sel).length])),
      };
    }),
  }), Object.entries(VISUALS));

  check(obs.width === 720, `${chapter.id}: 内容宽 ${obs.width}，应为 720`);
  check(obs.topband === 3, `${chapter.id}: 顶图带 ${obs.topband} 格，应为 3`);
  check(obs.sections.length === 5, `${chapter.id}: 五段实际 ${obs.sections.length} 段`);
  check(obs.sections.every((s) => s.question), `${chapter.id}: 有段落缺标题`);
  check(obs.sections.every((s) => s.note), `${chapter.id}: 有段落缺一句说明`);
  check(obs.sections.every((s) => s.children > 0), `${chapter.id}: 有段落内容完全为空`);
  check(obs.sections.every((s) => s.gap === '14px'), `${chapter.id}: 段内图间距不是 14px`);

  const contract = FIGURES.chapters?.[chapter.id] ?? [];
  check(contract.length === 5, `${chapter.id}: 图契约不是 5 段`);
  obs.sections.forEach((s, i) => {
    const f = contract[i];
    if (!f) return;
    check(s.status === f.status, `${chapter.id} 第${i + 1}段：页面状态 ${s.status} 与契约 ${f.status} 不一致`);
    if (f.status === 'ready') {
      const hits = s.visuals?.[f.kind] ?? 0;
      check(hits > 0, `${chapter.id} 第${i + 1}段：契约有图（${f.kind}），DOM 未渲染对应图`);
    }
    if (f.status === 'missing') warnings.push(`${chapter.id} 第${i + 1}段缺图 ${f.kind}（→${f.next ?? '未写批次'}）`);
  });

  const sizes = await fontSizesIn('.page');
  sizes.forEach((s) => check(FS_OK.has(s), `${chapter.id}: 出现了四档之外的字号 ${s}`));
  await page.screenshot({ path: `${SHOTS}/chapter-${chapter.id}.png` });
}

// L0 不应出现波次方块图
await goHome();
await page.evaluate(() => document.querySelector('button.chap[data-chapter-id="l0-01-what-shadow-does"]')?.click());
await sleep(240);
check((await page.evaluate(() => document.querySelectorAll('.wd-row').length)) === 0, 'L0 页不该出现波次模型图');

// 首页路径图不得退回完成率面板
await goHome();
const homeNarrative = await page.evaluate(() => ({
  progressBars: document.querySelectorAll('.path-bar').length,
  hasReadCopy: document.querySelector('.path')?.textContent?.includes('已读') ?? false,
  nodeCount: document.querySelectorAll('.path-dot2').length,
  heroBtns: document.querySelectorAll('.hero .btn').length,
}));
check(homeNarrative.progressBars === 0, '首页还在用进度条');
check(!homeNarrative.hasReadCopy, '首页还在显示「已读」完成率');
check(homeNarrative.nodeCount === 11, `首页学习路径应列出 11 个章节节点，实际 ${homeNarrative.nodeCount}`);
check(homeNarrative.heroBtns === 1, `首页 hero 应只有一个主按钮，实际 ${homeNarrative.heroBtns}`);

// L2 选波：点第 2 波后，顶部摘要、当前波细节、地图注记必须一起变
await page.evaluate(() => document.querySelector('button.chap[data-chapter-id="l2-01-altar-of-fangs"]')?.click());
await sleep(260);
const l2Before = await page.evaluate(() => ({
  top: document.querySelector('.topband .tb-v')?.textContent ?? '',
  selected: document.querySelector('.selected-wave .sw-pull')?.textContent ?? '',
  map: document.querySelector('.map-current b')?.textContent ?? '',
  priority: document.querySelectorAll('.sec')[2]?.querySelector('.pm-row')?.textContent ?? '',
}));
await page.evaluate(() => document.querySelectorAll('.route-wave')[1]?.click());
await sleep(220);
const l2After = await page.evaluate(() => ({
  top: document.querySelector('.topband .tb-v')?.textContent ?? '',
  selected: document.querySelector('.selected-wave .sw-pull')?.textContent ?? '',
  map: document.querySelector('.map-current b')?.textContent ?? '',
  priority: document.querySelectorAll('.sec')[2]?.querySelector('.pm-row')?.textContent ?? '',
}));
check(l2Before.selected.includes('第 1 波'), `L2 默认应选中第 1 波，实际「${l2Before.selected}」`);
check(l2After.selected.includes('第 2 波'), `L2 点击后应选中第 2 波，实际「${l2After.selected}」`);
check(l2Before.top !== l2After.top, 'L2 切换波次后顶部摘要没变');
check(l2Before.map !== l2After.map, 'L2 切换波次后地图注记没变');
check(!!l2Before.priority && !!l2After.priority, 'L2 第③段没有按当前波渲染优先级位置图');
check(l2Before.priority !== l2After.priority, 'L2 切换波次后第③段优先级映射没变');
await page.screenshot({ path: `${SHOTS}/chapter-l2-selected.png` });
const l2Sections = await page.$$('.sec');
if (l2Sections[1]) await l2Sections[1].screenshot({ path: `${SHOTS}/chapter-l2-selected-wave.png` });
if (l2Sections[2]) await l2Sections[2].screenshot({ path: `${SHOTS}/chapter-l2-priority.png` });
if (l2Sections[3]) await l2Sections[3].screenshot({ path: `${SHOTS}/chapter-l2-map.png` });

// ---- 解析台 ----
await page.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('解析台'))?.click());
await sleep(300);
const an = await page.evaluate(() => ({
  tabs: document.querySelectorAll('.tabs').length,
  sections: document.querySelectorAll('.sec').length,
  figures: document.querySelectorAll('.sec-fig > *').length,
}));
check(an.tabs === 0, '解析台还在用 tab（应改为纵向六段）');
check(an.sections === 6, `解析台应有 6 段，实际 ${an.sections}`);
check(an.figures >= 6, `解析台每段都应有图/表，实际 ${an.figures}`);
await page.screenshot({ path: `${SHOTS}/analyzer.png` });
const anSecs = await page.$$('.sec');
if (anSecs[3]) await anSecs[3].screenshot({ path: `${SHOTS}/analyzer-gearing.png` });
if (anSecs[4]) await anSecs[4].screenshot({ path: `${SHOTS}/analyzer-sources.png` });

// ---- 未实装专精骨架页 ----
await page.evaluate(() => document.querySelector('.specsw')?.click());
await sleep(120);
await page.evaluate(() => [...document.querySelectorAll('.specitem')].find((b) => b.textContent.includes('噬灭'))?.click());
await sleep(300);
const cs = await page.evaluate(() => ({
  pipeline: !!document.querySelector('svg[aria-label*="数据接入流程"]'),
  wires: document.querySelectorAll('.wirebox').length,
  width: Math.round(document.querySelector('.page').getBoundingClientRect().width),
}));
check(cs.pipeline, '骨架页缺流水线图');
check(cs.wires === 3, `骨架页应有 3 张灰模，实际 ${cs.wires}`);
check(cs.width === 720, `骨架页内容宽应为 720，实际 ${cs.width}`);
const csSizes = await fontSizesIn('.page');
csSizes.forEach((s) => check(FS_OK.has(s), `噬灭骨架页出现了四档之外的字号 ${s}`));
await page.screenshot({ path: `${SHOTS}/comingsoon.png` });

// 切回已实装专精，窄屏截首页（专精选择写入 localStorage）
await page.evaluate(() => document.querySelector('.specsw')?.click());
await sleep(120);
await page.evaluate(() => [...document.querySelectorAll('.specitem')].find((b) => b.textContent.includes('暗影牧师'))?.click());
await sleep(220);

// ---- 窄屏：不横向溢出，字号仍是四档 ----
await page.setViewport({ width: 390, height: 844 });
await page.goto(`file:///${DIST.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
const mobile = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  page: Math.round(document.querySelector('.page').getBoundingClientRect().width),
}));
check(mobile.overflow <= 1, `窄屏横向溢出 ${mobile.overflow}px`);
check(mobile.page > 0 && mobile.page <= 720, `窄屏内容宽异常：${mobile.page}`);
const mobileSizes = await fontSizesIn('.page');
mobileSizes.forEach((s) => check(FS_OK.has(s), `窄屏出现了四档之外的字号 ${s}`));
await page.screenshot({ path: `${SHOTS}/home-mobile.png` });

await browser.close();
check(jsErrors.length === 0, `页面有 JS 错误：${jsErrors.slice(0, 3).join(' | ')}`);

if (warnings.length) {
  console.log(`缺图警告 ${warnings.length} 段（有内容但尚未形成该段教学图）：`);
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
}
if (fails.length) {
  console.error(`界面门禁失败 ${fails.length} 条：`);
  fails.forEach((f) => console.error('  · ' + f));
  process.exit(1);
}
console.log(
  `界面门禁通过：${chapters.length} 章逐章检查 · 字号四档 ${homeSizes.join(' / ')} · 内容宽 ${pageWidth} · 顶图带 3 格 + 五段 · 解析台 6 段无 tab · 骨架页 3 张灰模`,
);
console.log(`截图：${SHOTS}`);
