/**
 * 静态托管预演：把 dist/ 用本地 HTTP 服务起来，再用无头浏览器完整走一遍。
 *
 * 为什么必须有这一步：file:// 双击能开，不代表放到静态托管上能开。
 * 底图是 `<img src="./maps/...">`（不在单文件里），托管平台若漏掉 dist/maps、
 * 或者路径按绝对路径解析，本地一切正常、上线后全是破图。这里用真实 HTTP 抓一遍：
 *   1. 不允许任何 4xx/5xx 请求（含地图、字体、图标）；
 *   2. 首页 12 个章节入口都在；
 *   3. 打开红玉新生池：路线条 12 柱、底图 naturalWidth > 0；
 *   4. 没有 console error / 未捕获异常 / NaN。
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(process.argv.find((x) => x.startsWith('--dist='))?.slice(7) ?? join(ROOT, 'dist'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const errors = [];
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const rel = normalize(urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  const file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

const listen = () => new Promise((done) => server.listen(0, '127.0.0.1', () => done(server.address().port)));
const port = await listen();
const base = `http://127.0.0.1:${port}/`;

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browserPath = candidates.find((path) => existsSync(path));
if (!browserPath) {
  console.error('找不到浏览器：装 Chrome/Edge，或用 CHROME_PATH 指定可执行文件。');
  server.close();
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: browserPath, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const failedRequests = [];
page.on('requestfailed', (req) => failedRequests.push(`${req.failure()?.errorText} ${req.url()}`));
page.on('response', (res) => { if (res.status() >= 400) failedRequests.push(`HTTP ${res.status()} ${res.url()}`); });
page.on('pageerror', (err) => errors.push(`页面异常：${String(err)}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`控制台错误：${msg.text()}`); });

await page.goto(base, { waitUntil: 'networkidle0' });
const home = await page.evaluate(() => ({
  chapters: document.querySelectorAll('button.chap').length,
  title: document.querySelector('h1')?.innerText?.trim() ?? '',
  maps: [...document.querySelectorAll('img')].map((img) => ({ src: img.getAttribute('src'), ok: img.naturalWidth > 0 })),
}));
if (home.chapters !== 12) errors.push(`首页章节入口 ${home.chapters} 个，应为 12`);
if (!home.title) errors.push('首页大标题没渲染出来');

await page.evaluate(() => document.querySelector('button.chap[data-chapter-id="l2-02-ruby-life-pools"]')?.click());
await new Promise((r) => setTimeout(r, 500));
const ruby = await page.evaluate(() => {
  const img = document.querySelector('[data-figure-kind="route-map"] img');
  return {
    strips: document.querySelectorAll('.route-wave').length,
    mapSrc: img?.getAttribute('src') ?? null,
    mapLoaded: img ? img.naturalWidth : 0,
    text: document.body.innerText,
  };
});
if (ruby.strips !== 12) errors.push(`红玉路线条 ${ruby.strips} 柱，应为 12`);
if (!(ruby.mapLoaded > 0)) errors.push(`底图没加载：${ruby.mapSrc ?? '(没有 img)'}（naturalWidth=${ruby.mapLoaded}）`);
if (/NaN|undefined|\{\{/.test(ruby.text)) errors.push('页面文本里出现 NaN / undefined / 未替换的占位符');

await browser.close();
server.close();

if (failedRequests.length) {
  errors.push(`有 ${failedRequests.length} 个请求失败：`);
  for (const item of failedRequests.slice(0, 8)) errors.push(`  ${item}`);
}

if (errors.length) {
  console.error('静态托管预演失败：');
  for (const item of errors) console.error(`  ✗ ${item}`);
  process.exit(1);
}
console.log(`静态托管预演通过：HTTP ${base} · 12 章入口 · 红玉 12 柱 · 底图 ${ruby.mapSrc} 已加载（${ruby.mapLoaded}px）· 0 个失败请求`);
