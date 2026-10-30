import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const EDGE_ROOTS = [
  'C:/Program Files/Microsoft/Edge/Application',
  'C:/Program Files (x86)/Microsoft/Edge/Application',
];

const versionedEdgeBinaries = EDGE_ROOTS.flatMap((root) => {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+(?:\.\d+)+$/.test(entry.name))
    .map((entry) => ({ version: entry.name, path: join(root, entry.name, 'msedge.exe') }))
    .filter(({ path }) => existsSync(path))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
    .map(({ path }) => path);
});

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ...versionedEdgeBinaries,
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export const findBrowser = () => BROWSER_CANDIDATES.find((path) => existsSync(path)) ?? null;

const freePort = () => new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolvePort(port));
  });
});

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/**
 * Windows Edge 的桌面启动器会在拉起真正浏览器后以 0 退出，导致
 * puppeteer.launch() 把「启动器退出」误判为浏览器启动失败。这里用独立
 * profile + CDP 端口启动 Edge，再连接真正浏览器；其他浏览器仍走默认路径。
 */
export const launchBrowser = async ({ executablePath, args = [] }) => {
  if (!/msedge(?:\.exe)?$/i.test(executablePath)) {
    return puppeteer.launch({
      executablePath,
      headless: 'new',
      args,
    });
  }

  const profileDir = mkdtempSync(join(tmpdir(), 'wowanalyzer-ui-'));
  const port = await freePort();
  let stderr = '';
  const child = spawn(executablePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    ...args,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4000);
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${port}`,
          defaultViewport: null,
        });
        const close = browser.close.bind(browser);
        browser.close = async (...closeArgs) => {
          try {
            return await close(...closeArgs);
          } finally {
            if (resolve(profileDir).startsWith(resolve(tmpdir()))) {
              await sleep(500);
              try {
                rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
              } catch {
                // Windows 偶尔在浏览器退出后短暂占用 profile；清理失败不应影响测试结论。
              }
            }
          }
        };
        return browser;
      }
    } catch {
      // CDP 还没开始监听，继续等待。
    }
    await sleep(100);
  }

  if (!child.killed) child.kill();
  throw new Error(`Edge CDP 启动超时${stderr.trim() ? `：${stderr.trim()}` : ''}`);
};
