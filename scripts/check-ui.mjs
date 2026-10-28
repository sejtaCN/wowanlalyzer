/**
 * 界面门禁：逐章检查真实 DOM，不靠肉眼。
 *
 * 断言：
 *   1. 字号只来自六档白名单（30 / 21 / 17 / 14 / 13 / 12），内容宽 720、段内间距 14
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

const FS_OK = new Set(['36px', '24px', '18px', '16px', '14px', '12px']);
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
  'phase-chart': '.tbl-ph, .btl svg, .simtl-track',
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
await page.setViewport({ width: 1440, height: 1000 });
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

const fontWeightsIn = (sel) =>
  page.evaluate((s) => {
    const root = document.querySelector(s);
    const out = new Set();
    root.querySelectorAll('*').forEach((el) => {
      if (el.closest('svg') || el.closest('details:not([open])')) return;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText) out.add(getComputedStyle(el).fontWeight);
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
homeSizes.forEach((s) => check(FS_OK.has(s), `首页出现了六档之外的字号：${s}`));
const homeWeights = await fontWeightsIn('.page');
homeWeights.forEach((weight) => check(weight === '400' || weight === '500', `首页出现了 400/500 之外的字重：${weight}`));
const typographyTokens = await page.evaluate(() => {
  const style = getComputedStyle(document.documentElement);
  return {
    display: style.getPropertyValue('--fs-display').trim(),
    title: style.getPropertyValue('--fs-title').trim(),
    subtitle: style.getPropertyValue('--fs-sub').trim(),
    body: style.getPropertyValue('--fs-body').trim(),
    meta: style.getPropertyValue('--fs-meta').trim(),
    caption: style.getPropertyValue('--fs-caption').trim(),
  };
});
check(
  JSON.stringify(typographyTokens) === JSON.stringify({
    display: '36px', title: '24px', subtitle: '18px', body: '16px', meta: '14px', caption: '12px',
  }),
  `全局字号 token 不是 36/24/18/16/14/12：${JSON.stringify(typographyTokens)}`,
);
const homeTypography = await page.evaluate(() => ({
  h1: getComputedStyle(document.querySelector('.page h1')).fontSize,
  body: getComputedStyle(document.querySelector('.page')).fontSize,
}));
check(homeTypography.h1 === '36px', `首页标题应为 36px，实际 ${homeTypography.h1}`);
check(homeTypography.body === '16px', `首页正文应为 16px，实际 ${homeTypography.body}`);
const pageWidth = await page.evaluate(() => Math.round(document.querySelector('.page').getBoundingClientRect().width));
check(pageWidth === 1392, `桌面内容宽应为 1392，实际 ${pageWidth}`);
check((1440 - pageWidth) / 2 <= 24, `桌面页左右留白过大：${(1440 - pageWidth) / 2}px`);
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
        paddingTop: getComputedStyle(s).paddingTop,
        visuals: Object.fromEntries(selectors.map(([k, sel]) => [k, s.querySelectorAll(sel).length])),
      };
    }),
    typography: {
      h1: getComputedStyle(document.querySelector('.page h1')).fontSize,
      h2: getComputedStyle(document.querySelector('.sec h2')).fontSize,
      body: getComputedStyle(document.querySelector('.page')).fontSize,
      note: getComputedStyle(document.querySelector('.sec-note')).fontSize,
    },
  }), Object.entries(VISUALS));

  const expectedContentWidth = chapter.level === 'L0' ? 1392 : 1168;
  check(obs.width === expectedContentWidth, `${chapter.id}: 内容宽 ${obs.width}，应为 ${expectedContentWidth}`);
  check(obs.topband === 3, `${chapter.id}: 顶图带 ${obs.topband} 格，应为 3`);
  check(obs.sections.length === 5, `${chapter.id}: 五段实际 ${obs.sections.length} 段`);
  check(obs.sections.every((s) => s.question), `${chapter.id}: 有段落缺标题`);
  check(obs.sections.every((s) => s.note), `${chapter.id}: 有段落缺一句说明`);
  check(obs.sections.every((s) => s.children > 0), `${chapter.id}: 有段落内容完全为空`);
  check(obs.sections.every((s) => s.gap === '16px'), `${chapter.id}: 段内图间距不是 16px`);
  const leadingSections = obs.sections.slice(0, 4);
  check(leadingSections.every((s) => s.paddingTop === '32px'), `${chapter.id}: 前四段间距不是 32px`);
  check(
    obs.sections[4]?.paddingTop === (chapter.level !== 'L0' ? '24px' : '32px'),
    `${chapter.id}: 第五段内边距不是预期值`,
  );
  check(obs.typography.h1 === '36px', `${chapter.id}: 页标题不是 36px`);
  check(obs.typography.h2 === '24px', `${chapter.id}: 段标题不是 24px`);
  check(obs.typography.body === '16px', `${chapter.id}: 正文不是 16px`);
  check(obs.typography.note === '16px', `${chapter.id}: 段说明不是 16px`);

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
  sizes.forEach((s) => check(FS_OK.has(s), `${chapter.id}: 出现了六档之外的字号 ${s}`));
  const weights = await fontWeightsIn('.page');
  weights.forEach((weight) => check(weight === '400' || weight === '500', `${chapter.id}: 出现了 400/500 之外的字重 ${weight}`));

  const readerView = await page.evaluate(({ id, runIds }) => {
    const sections = [...document.querySelectorAll('.sec')];
    const sec3 = sections[2];
    const sec5 = sections[4];
    const evidence = document.querySelector('.evidence');
    const evidenceRaw = evidence?.querySelector('details.evidence-raw');
    const css = (selector, property) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el)[property] : '';
    };
    const cssPx = (selector, property) => {
      const value = css(selector, property);
      return value ? Math.round(parseFloat(value)) : 0;
    };
    const visibleNotes = sec5
      ? [...new Set([
        ...sec5.querySelectorAll('.note'),
        ...[...sec5.children].filter((el) => el.matches('.note, .sec-note')),
      ])].filter((el) => el.textContent?.trim() && !el.closest('details:not([open])')).length
      : 0;

    return {
      id,
      pageText: document.querySelector('.page')?.innerText ?? '',
      evidenceText: evidence?.innerText ?? '',
      evidenceRawText: evidenceRaw?.textContent ?? '',
      hasEvidenceRaw: Boolean(evidenceRaw),
      coversRunIds: runIds.every((runId) => evidenceRaw?.textContent?.includes(runId)),
      sec5VisibleNotes: visibleNotes,
      priorityLegend: sec3?.querySelector('.pm-legend')?.textContent ?? '',
      hasPendingSkill: sec3?.textContent?.includes('待核对') ?? false,
      priorityText: sec3?.innerText ?? '',
      priorityKeyTitles: [...(sec3?.querySelectorAll('.pm-head b') ?? [])].map((el) => el.title).filter(Boolean),
      phaseRows: sec5?.querySelectorAll('details.phase-details tbody tr').length ?? 0,
      hasPhaseMethod: Boolean(sec5?.querySelector('details.phase-method')),
      hasSelectedWaveRaw: Boolean(document.querySelector('details.sw-raw')),
      selectedWaveRawText: document.querySelector('details.sw-raw')?.textContent ?? '',
      readerPage: Boolean(document.querySelector('.reader-page')),
      readerTopBand: Boolean(document.querySelector('.reader-topband')),
      readerActionCells: document.querySelectorAll('.reader-topband .reader-action').length,
      tocItems: document.querySelectorAll('.chapter-toc button').length,
      readerShellWidth: Math.round(document.querySelector('.chapter-shell')?.getBoundingClientRect().width ?? 0),
      readerAccent: {
        topNavActive: css('.reader-topbar nav button[aria-current="true"]', 'backgroundColor'),
        primaryNumber: css('.reader-page .reader-section-primary .sec-no', 'backgroundColor'),
        action: css('.reader-page .reader-action', 'backgroundColor'),
      },
      readerVerdict: document.querySelector('.reader-page .reader-verdict')?.textContent?.trim() ?? '',
      readerType: {
        h1: css('.reader-page h1', 'fontSize'),
        h2: css('.reader-page .sec h2', 'fontSize'),
        h3: css('.reader-page h3', 'fontSize'),
        body: css('.reader-page', 'fontSize'),
        subtitle: css('.reader-page > .page-sub', 'fontSize'),
        note: css('.reader-page .sec-note', 'fontSize'),
        meta: css('.reader-page .pm-reason', 'fontSize'),
        caption: css('.reader-page .tb-axis', 'fontSize'),
      },
      readerSpacing: {
        sectionTop: css('.reader-page .sec', 'paddingTop'),
        topbandGap: css('.reader-topband', 'gap'),
        topCellGap: css('.reader-topband .tb-cell', 'gap'),
        topbandBottom: css('.reader-topband', 'marginBottom'),
        evidenceTop: css('.reader-page .evidence', 'marginTop'),
        noteMaxWidth: cssPx('.reader-page .sec-note', 'maxWidth'),
        figureGap: css('.reader-page .sec-fig', 'gap'),
      },
      readerWeights: [...new Set(
        [...document.querySelectorAll('.reader-page *')]
          .filter((el) => !el.closest('svg') && !el.closest('details:not([open])'))
          .filter((el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim()))
          .map((el) => getComputedStyle(el).fontWeight),
      )].sort(),
      newDisplays: {
        '.evidence-raw': document.querySelectorAll('.evidence-raw').length,
        '.phase-method': document.querySelectorAll('.phase-method').length,
        '.pm-reader': document.querySelectorAll('.pm-reader').length,
        '.reader-page': document.querySelectorAll('.reader-page').length,
        '.reader-topband': document.querySelectorAll('.reader-topband').length,
        '.chapter-toc': document.querySelectorAll('.chapter-toc').length,
      },
    };
  }, { id: chapter.id, runIds: chapter.evidence.runIds });

  if (chapter.level !== 'L0') {
    check(!/[`*]{1,2}|##/.test(readerView.pageText), `${chapter.id}: 可见文本含 Markdown 标记`);
    check(
      !/(runId|dec_voidform_|trace_)/.test(readerView.evidenceText),
      `${chapter.id}: 证据摘要仍暴露 runId / dec_ / trace_`,
    );
    check(readerView.hasEvidenceRaw, `${chapter.id}: 缺少原始记录折叠 details.evidence-raw`);
    check(readerView.coversRunIds, `${chapter.id}: evidence-raw 未覆盖全部 runId`);
    check(readerView.readerPage, `${chapter.id}: 缺少 reader-page 视觉作用域`);
    check(readerView.readerTopBand, `${chapter.id}: 顶图带未切换为决策优先布局`);
    check(readerView.readerActionCells === 1, `${chapter.id}: 应只有一个主行动格`);
    check(readerView.tocItems === 5, `${chapter.id}: 目录应有 5 项，实际 ${readerView.tocItems}`);
    check(readerView.readerShellWidth === 1392, `${chapter.id}: 桌面章节目录骨架应为 1392px，实际 ${readerView.readerShellWidth}`);
    check((1440 - readerView.readerShellWidth) / 2 <= 24, `${chapter.id}: 桌面章节壳左右留白过大`);
    check(readerView.readerAccent.topNavActive === 'rgba(0, 0, 0, 0)', `${chapter.id}: 顶栏激活态不应与主行动卡共用金色实底`);
    check(readerView.readerAccent.primaryNumber === 'rgba(245, 196, 81, 0.12)', `${chapter.id}: 主段号应使用弱金色底，不应与行动卡同权`);
    check(readerView.readerAccent.action === 'rgb(245, 196, 81)', `${chapter.id}: 黄色实底应只属于主行动卡`);
    const expectedVerdicts = {
      'l1-01-mid': '看冷却',
      'l1-02-large': '开',
      'l1-03-small': '不开',
      'l1-04-boss': '看下一波',
      'l1-05-rhythm': '看间隔',
      'l1-06-adds': '开',
      'l2-01-altar-of-fangs': '开',
    };
    check(
      readerView.readerVerdict === expectedVerdicts[chapter.id],
      `${chapter.id}: 主行动结论应为「${expectedVerdicts[chapter.id]}」，实际「${readerView.readerVerdict}」`,
    );
    check(readerView.readerSpacing.sectionTop === '32px', `${chapter.id}: 五段主间距应为 32px，实际 ${readerView.readerSpacing.sectionTop}`);
    check(readerView.readerSpacing.topbandGap === '16px', `${chapter.id}: 顶图带组内间距应为 16px，实际 ${readerView.readerSpacing.topbandGap}`);
    check(readerView.readerSpacing.topCellGap === '12px', `${chapter.id}: 顶图带卡片内部间距应为 12px，实际 ${readerView.readerSpacing.topCellGap}`);
    check(readerView.readerSpacing.topbandBottom === '48px', `${chapter.id}: 顶图带后应为 48px，实际 ${readerView.readerSpacing.topbandBottom}`);
    check(readerView.readerSpacing.evidenceTop === '48px', `${chapter.id}: 证据区上间距应为 48px，实际 ${readerView.readerSpacing.evidenceTop}`);
    check(readerView.readerSpacing.noteMaxWidth === 576, `${chapter.id}: 说明行宽应为 36em（576px），实际 ${readerView.readerSpacing.noteMaxWidth}px`);
    check(readerView.readerSpacing.figureGap === '16px', `${chapter.id}: 段内图间距应为 16px，实际 ${readerView.readerSpacing.figureGap}`);
    if (chapter.casePanel.status === 'phases') {
      check(readerView.phaseRows === 9, `${chapter.id}: 第五段阶段表应为 9 行，实际 ${readerView.phaseRows}`);
      check(readerView.hasPhaseMethod, `${chapter.id}: 第五段缺少 methods/限制折叠 details.phase-method`);
    }
    if (chapter.level === 'L2') {
      check(readerView.hasSelectedWaveRaw, `${chapter.id}: 当前波缺少配对记录折叠 details.sw-raw`);
      check(
        /dec_voidform_on_1_/.test(readerView.selectedWaveRawText) && /dec_voidform_on_0_/.test(readerView.selectedWaveRawText),
        `${chapter.id}: 配对记录未完整保留开 / 不开 runId`,
      );
      check(!/(runId|dec_|trace_)/.test(readerView.pageText), `${chapter.id}: 默认页面仍暴露 runId / dec_ / trace_`);
    }
  }

  if (chapter.id === 'l1-02-large') {
    check(
      readerView.sec5VisibleNotes <= 2,
      `${chapter.id}: 第五段关闭状态可见说明 ${readerView.sec5VisibleNotes} 块，应不超过 2 块`,
    );
    check(!readerView.priorityLegend.includes('38 条 APL 表'), `${chapter.id}: 优先级图例仍含“38 条 APL 表”`);
    check(readerView.hasPendingSkill, `${chapter.id}: 未核对技能缺少“待核对”标记`);
    check(
      !/(aoe_loop|void_volley|mind_flay|shadow_word_pain)/.test(readerView.priorityText),
      `${chapter.id}: 优先级卡仍裸露英文技能键`,
    );
    check(
      readerView.priorityKeyTitles.length === 4,
      `${chapter.id}: 英文技能键未完整进入 title`,
    );
    check(readerView.readerType.h1 === '36px', `${chapter.id}: 页标题应为 36px，实际 ${readerView.readerType.h1}`);
    check(readerView.readerType.h2 === '24px', `${chapter.id}: 段标题应为 24px，实际 ${readerView.readerType.h2}`);
    check(readerView.readerType.h3 === '18px', `${chapter.id}: 图表标题应为 18px，实际 ${readerView.readerType.h3}`);
    check(readerView.readerType.body === '16px', `${chapter.id}: 正文应为 16px，实际 ${readerView.readerType.body}`);
    check(readerView.readerType.subtitle === '18px', `${chapter.id}: 副标题应为 18px，实际 ${readerView.readerType.subtitle}`);
    check(readerView.readerType.note === '16px', `${chapter.id}: 段说明应为 16px，实际 ${readerView.readerType.note}`);
    check(readerView.readerType.meta === '14px', `${chapter.id}: 元信息应为 14px，实际 ${readerView.readerType.meta}`);
    check(readerView.readerType.caption === '12px', `${chapter.id}: 图注应为 12px，实际 ${readerView.readerType.caption}`);
  } else if (chapter.level === 'L0') {
    for (const [selector, count] of Object.entries(readerView.newDisplays)) {
      check(count === 0, `${chapter.id}: 提前出现 L1-02 样板展示 ${selector}`);
    }
  }

  await page.screenshot({ path: `${SHOTS}/chapter-${chapter.id}.png` });
    if (chapter.casePanel?.status === 'simulation') {
      const secs = await page.$$('.sec');
      if (secs[4]) await secs[4].screenshot({ path: `${SHOTS}/chapter-${chapter.id}-timeline.png` });
    }
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
  groupColumns: getComputedStyle(document.querySelector('.groups')).gridTemplateColumns
    .split(' ')
    .map((value) => Number.parseFloat(value)),
  groupRects: [...document.querySelectorAll('.groups > .group')].map((group) => {
    const rect = group.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }),
}));
check(homeNarrative.progressBars === 0, '首页还在用进度条');
check(!homeNarrative.hasReadCopy, '首页还在显示「已读」完成率');
check(homeNarrative.nodeCount === 11, `首页学习路径应列出 11 个章节节点，实际 ${homeNarrative.nodeCount}`);
check(homeNarrative.heroBtns === 1, `首页 hero 应只有一个主按钮，实际 ${homeNarrative.heroBtns}`);
check(
  homeNarrative.groupColumns.length === 2
    && Math.abs(homeNarrative.groupRects[0].width - homeNarrative.groupRects[1].width) <= 2
    && homeNarrative.groupRects[0].height < homeNarrative.groupRects[1].height
    && Math.abs((homeNarrative.groupRects[0].height + homeNarrative.groupRects[2].height + 16) - homeNarrative.groupRects[1].height) <= 96,
  `首页桌面分组应形成 L0/L2 左列 + L1 右列，实际 ${homeNarrative.groupRects.map((rect) => `${rect.width}×${rect.height}`).join(' / ')}`,
);

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
const anWeights = await fontWeightsIn('.page');
anWeights.forEach((weight) => check(weight === '400' || weight === '500', `解析台出现了 400/500 之外的字重：${weight}`));
const archonOnly = await page.evaluate(() => {
  const pageText = document.querySelector('.page')?.textContent ?? '';
  const allRunIds = [...document.querySelectorAll('tbody tr td:last-child')]
    .map((cell) => cell.textContent?.trim() ?? '')
    .filter((text) => /^[a-z][a-z0-9_]*(?:__[a-z0-9_]+)+$/i.test(text));
  return {
    voidRows: allRunIds.filter((runId) => runId.startsWith('voidweaver')).length,
    visibleRunIds: allRunIds.length,
    statesBothHeroes: /执政官 runId \d+ 个/.test(pageText) && pageText.includes('虚空编织者数据待补'),
    sections: [...document.querySelectorAll('.statopt, .gear, [data-hero]')].map((node) => node.getAttribute('data-hero')),
  };
});
check(archonOnly.voidRows === 0, `解析台混入 ${archonOnly.voidRows} 条 Voidweaver run`);
check(archonOnly.visibleRunIds > 0, '解析台原始结果没有任何 runId');
check(archonOnly.statesBothHeroes, '解析台未明确显示「执政官可用 / 虚空编织者待补」');
check(archonOnly.sections.every((hero) => hero === 'archon'), '解析台存在未绑定 Archon 的分析区块');
const statModels = await page.evaluate(() => ({
  allocations: document.querySelectorAll('.stat-alloc-row').length,
  allocationLabels: [...document.querySelectorAll('.stat-alloc-hd b')].map((node) => node.textContent?.trim()),
  heatColumns: document.querySelectorAll('.stat-heat-head > span').length,
  heatRows: document.querySelectorAll('.stat-heat-row:not(.stat-heat-head)').length,
}));
check(statModels.allocations === 4, `属性配比应显示 4 个模型，实际 ${statModels.allocations}`);
check(statModels.allocationLabels[0] === '单体 300s', `属性配比首个模型应为单体 300s，实际 ${statModels.allocationLabels[0]}`);
check(statModels.heatColumns === 5, `属性热矩阵应为属性列 + 4 模型列，实际 ${statModels.heatColumns}`);
check(statModels.heatRows === 4, `属性热矩阵应有 4 行属性，实际 ${statModels.heatRows}`);
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
check(cs.width === 1392, `骨架页内容宽应为 1392，实际 ${cs.width}`);
const csSizes = await fontSizesIn('.page');
csSizes.forEach((s) => check(FS_OK.has(s), `噬灭骨架页出现了六档之外的字号 ${s}`));
const csWeights = await fontWeightsIn('.page');
csWeights.forEach((weight) => check(weight === '400' || weight === '500', `噬灭骨架页出现了 400/500 之外的字重：${weight}`));
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
  h1: getComputedStyle(document.querySelector('.page h1')).fontSize,
  body: getComputedStyle(document.querySelector('.page')).fontSize,
}));
check(mobile.overflow <= 1, `窄屏横向溢出 ${mobile.overflow}px`);
check(mobile.page > 0 && mobile.page <= 720, `窄屏内容宽异常：${mobile.page}`);
check(mobile.h1 === '36px', `窄屏首页标题应保持 36px，实际 ${mobile.h1}`);
check(mobile.body === '16px', `窄屏首页正文应为 16px，实际 ${mobile.body}`);
const mobileSizes = await fontSizesIn('.page');
mobileSizes.forEach((s) => check(FS_OK.has(s), `窄屏首页出现了六档之外的字号 ${s}`));
const mobileWeights = await fontWeightsIn('.page');
mobileWeights.forEach((weight) => check(weight === '400' || weight === '500', `窄屏首页出现了 400/500 之外的字重：${weight}`));
await page.screenshot({ path: `${SHOTS}/home-mobile.png` });

// 冻结兼容冒烟：≤420px 不再参与桌面设计验收，只防止已有布局彻底损坏
await page.setViewport({ width: 420, height: 900 });
await page.goto(`file:///${DIST.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.querySelector('button.chap[data-chapter-id="l1-02-large"]')?.click());
await sleep(260);
const mobileL1 = await page.evaluate(() => {
  const navButtons = [...document.querySelectorAll('.reader-topbar nav button')];
  const cells = [...document.querySelectorAll('.reader-topband .tb-cell')];
  const topbar = document.querySelector('.reader-topbar');
  return {
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    h1Size: getComputedStyle(document.querySelector('.reader-page h1')).fontSize,
    topbarHeight: Math.round(topbar?.getBoundingClientRect().height ?? 0),
    navMinHeight: Math.min(...navButtons.map((button) => button.getBoundingClientRect().height)),
    order: cells
      .map((cell) => ({
        kind: cell.classList.contains('reader-action')
          ? 'action'
          : cell.classList.contains('reader-value')
            ? 'value'
            : 'situation',
        top: Math.round(cell.getBoundingClientRect().top),
      }))
      .sort((a, b) => a.top - b.top),
  };
});
check(mobileL1.overflow === 0, `L1-02 窄屏横向溢出 ${mobileL1.overflow}px`);
check(mobileL1.h1Size === '36px', `L1-02 窄屏标题降到了 ${mobileL1.h1Size}，应保持 36px`);
check(mobileL1.topbarHeight === 56, `L1-02 窄屏顶栏应为 56px，实际 ${mobileL1.topbarHeight}`);
check(mobileL1.navMinHeight >= 44, `L1-02 窄屏导航命中区不足 44px，实际 ${mobileL1.navMinHeight}`);
check(
  mobileL1.order.map((item) => item.kind).join(',') === 'action,value,situation',
  `L1-02 窄屏顶图带顺序应为主张→价值→场景，实际 ${mobileL1.order.map((item) => item.kind).join(',')}`,
);
await page.screenshot({ path: `${SHOTS}/chapter-l1-02-mobile.png` });

await page.setViewport({ width: 375, height: 812 });
await page.goto(`file:///${DIST.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.querySelector('button.chap[data-chapter-id="l1-02-large"]')?.click());
await sleep(260);
const mobile375 = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  h1Size: getComputedStyle(document.querySelector('.reader-page h1')).fontSize,
}));
check(mobile375.overflow === 0, `L1-02 375px 横向溢出 ${mobile375.overflow}px`);
check(mobile375.h1Size === '36px', `L1-02 375px 标题应为 36px，实际 ${mobile375.h1Size}`);
await page.screenshot({ path: `${SHOTS}/chapter-l1-02-375.png` });

// 冻结兼容冒烟：全页面不得横向滚动，只有显式表格容器可以局部滚动
await page.setViewport({ width: 420, height: 900 });
await page.goto(`file:///${DIST.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
for (const chapter of chapters) {
  await goHome();
  await page.evaluate((id) => document.querySelector(`button.chap[data-chapter-id="${id}"]`)?.click(), chapter.id);
  await sleep(100);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow === 0, `${chapter.id}: 420px 页面横向溢出 ${overflow}px`);
  if (chapter.id === 'l0-03-priority-table') {
    await page.screenshot({ path: `${SHOTS}/chapter-l0-03-mobile.png` });
  }
}
await page.evaluate(() => [...document.querySelectorAll('nav button')].find((button) => button.textContent.includes('解析台'))?.click());
await sleep(180);
const analyzerOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(analyzerOverflow === 0, `解析台 420px 页面横向溢出 ${analyzerOverflow}px`);
await page.screenshot({ path: `${SHOTS}/analyzer-mobile.png` });
await page.evaluate(() => document.querySelector('.specsw')?.click());
await sleep(80);
await page.evaluate(() => [...document.querySelectorAll('.specitem')].find((button) => button.textContent.includes('噬灭'))?.click());
await sleep(180);
const comingSoonOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(comingSoonOverflow === 0, `噬灭骨架页 420px 页面横向溢出 ${comingSoonOverflow}px`);
await page.screenshot({ path: `${SHOTS}/comingsoon-mobile.png` });

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
  `界面门禁通过：${chapters.length} 章逐章检查 · 字号白名单 · 内容宽 ${pageWidth} · 顶图带 3 格 + 五段 · 解析台 6 段无 tab · 骨架页 3 张灰模`,
);
console.log(`截图：${SHOTS}`);
