/**
 * 设计门禁：把外部设计规则书（Refactoring UI）与反 AI 味门禁（Hallmark）
 * 适配成本项目的可执行断言。跑在源码上，不需要浏览器。
 *
 * 规则来源与适配说明见 docs/design-rules.md。
 *
 * 断言：
 *   1. 间距阶（Refactoring UI §3.2）：padding/margin/gap 只许取阶上的值，
 *      且阶本身必须满足「相邻差不低于 25%」
 *   2. 颜色字面量（Hallmark gate 48 / Refactoring UI 法 3）：颜色只许来自 token，
 *      字面量色值只允许出现在 :root 的 token 块内
 *   3. 对比度（Refactoring UI §5.6 / WCAG）：token 推出的前景/背景组合
 *      全部满足 4.5:1（大字 3:1）
 *   4. 中文字距（中文场景适配，本项目独有）：汉字标签不许用正 letter-spacing，
 *      不许用 text-transform: uppercase（对汉字无效且误导）
 *   5. 焦点可见（Refactoring UI 法 / WCAG 2.4.7）：可聚焦元素要有 focus-visible 样式
 *   6. 动效降级（Hallmark gate 27）：有动效就要有 prefers-reduced-motion 兜底
 *
 * 用法：
 *   node scripts/check-design.mjs
 *   node scripts/check-design.mjs --warn-only
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps', 'web', 'src');
const warnOnly = process.argv.includes('--warn-only');

const fails = [];
const warnings = [];
const fail = (msg) => fails.push(msg);
const warn = (msg) => warnings.push(msg);

/* ------------------------------------------------------------------ *
 * 1. 间距阶
 * ------------------------------------------------------------------ */

/**
 * 间距阶。相邻差不低于 25%——Refactoring UI §3.2.2 明确说
 * 「全是 4px 倍数不是系统」，关键在比例递进。
 * 14px 不在阶里：它是 --gap 的语义值（段内图间距），设计源 §3.4 已定，
 * 且被 check-ui.mjs 断言，单独放行。
 */
const SPACING_SCALE = [2, 4, 8, 12, 16, 24, 32, 48, 64];
const SPACING_ALLOWED = new Set([...SPACING_SCALE, 14]);

function checkScaleIntegrity() {
  for (let i = 0; i < SPACING_SCALE.length - 1; i++) {
    const a = SPACING_SCALE[i];
    const b = SPACING_SCALE[i + 1];
    const ratio = (b - a) / a;
    if (ratio < 0.25) {
      fail(`间距阶 ${a}→${b} 只递增 ${(ratio * 100).toFixed(0)}%，低于 25% 下限（相邻档要能一眼分辨）`);
    }
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx|ts)$/.test(e)) out.push(p);
  }
  return out;
}

/** 抓出所有 spacing 类属性里的裸 px 值。 */
function spacingLiterals(src) {
  const hits = [];
  const re = /(?<![-\w])(padding|margin|gap|row-gap|column-gap)(-[a-z]+)?\s*:\s*([^;{}]+)[;]/g;
  let m;
  while ((m = re.exec(src))) {
    const prop = m[1] + (m[2] || '');
    const val = m[3];
    if (val.includes('var(')) continue;
    for (const mm of val.matchAll(/(?<![\w.-])(\d+)px/g)) {
      hits.push({ prop, value: Number(mm[1]), raw: val.trim() });
    }
  }
  return hits;
}

function checkSpacing() {
  const files = walk(SRC);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const h of spacingLiterals(src)) {
      if (SPACING_ALLOWED.has(h.value)) continue;
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      fail(`${rel}：${h.prop} 用了 ${h.value}px（${h.raw}），不在间距阶 ${SPACING_SCALE.join('/')} 内`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2. 颜色字面量
 * ------------------------------------------------------------------ */

/**
 * 只允许 token 块内出现字面量色值。token 块 = :root { ... } 的大括号范围。
 * 其余位置（规则、TSX 内联样式）一律要引用 var(--token)。
 */
function checkColorLiterals() {
  const cssPath = join(SRC, 'ui.css');
  const css = readFileSync(cssPath, 'utf8');
  const rel = relative(ROOT, cssPath).replace(/\\/g, '/');

  // 切出 :root token 块的行范围
  const rootStart = css.indexOf(':root');
  const rootEnd = rootStart >= 0 ? css.indexOf('\n}', rootStart) : -1;
  const tokenBlock = rootStart >= 0 && rootEnd > rootStart ? css.slice(rootStart, rootEnd) : '';
  const outside = rootStart >= 0 ? css.slice(0, rootStart) + css.slice(rootEnd) : css;

  const HEX = /#[0-9a-fA-F]{3,8}\b/g;
  const seen = new Set();
  for (const m of outside.matchAll(HEX)) {
    const key = m.index;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = outside.slice(0, key).split('\n').length;
    fail(`${rel}:${line}：色值字面量 ${m[0]} 出现在 token 块外，应改用 var(--token)`);
  }

  // TSX 内联样式里的颜色
  for (const f of walk(join(SRC, 'components')).concat(walk(join(SRC, 'views')))) {
    if (f.endsWith('.css')) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(HEX)) {
      const r = relative(ROOT, f).replace(/\\/g, '/');
      const line = src.slice(0, m.index).split('\n').length;
      fail(`${r}:${line}：色值字面量 ${m[0]} 应提到 ui.css 的 token 里再用 var() 引用`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 3. 对比度
 * ------------------------------------------------------------------ */

function hexToRgb(s) {
  const h = s.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function relLum([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a, b) {
  const l1 = relLum(hexToRgb(a));
  const l2 = relLum(hexToRgb(b));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** token 里声明的前景/背景组合。 */
const CONTRAST_PAIRS = [
  ['--ink', '--bg'], ['--sub', '--bg'], ['--muted', '--bg'],
  ['--ink', '--card'], ['--sub', '--card'], ['--muted', '--card'],
  ['--ink', '--card-2'], ['--sub', '--card-2'], ['--muted', '--card-2'],
  ['--ink', '--card-3'], ['--sub', '--card-3'], ['--muted', '--card-3'],
  ['--gold', '--bg'], ['--gold', '--card'], ['--gold', '--card-3'],
  ['--up', '--card'], ['--down', '--card'], ['--warn', '--card'],
  ['--gold', '--card-2'], ['--up', '--card-3'], ['--down', '--card-3'],
];

function checkContrast() {
  const css = readFileSync(join(SRC, 'ui.css'), 'utf8');
  const rootStart = css.indexOf(':root');
  const rootEnd = css.indexOf('\n}', rootStart);
  const block = css.slice(rootStart, rootEnd);
  const tokens = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  const resolve_ = (name, depth = 0) => {
    if (depth > 6) return null;
    const v = tokens[name];
    if (!v) return null;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
    const inner = v.match(/^var\((--[\w-]+)\)$/);
    return inner ? resolve_(inner[1], depth + 1) : null;
  };
  for (const [fg, bg] of CONTRAST_PAIRS) {
    const a = resolve_(fg);
    const b = resolve_(bg);
    if (!a || !b) continue;
    const r = contrast(a, b);
    if (r < 4.5) {
      fail(`对比度不足：${fg}(${a}) on ${bg}(${b}) = ${r.toFixed(2)}:1，低于 4.5:1`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 4. 中文字距（本项目独有，两个外部规则书都没覆盖）
 * ------------------------------------------------------------------ */

/**
 * 中文标签不许用正 letter-spacing。
 * 汉字是等宽方块字，加字距会在字与字之间插进空隙，破坏 clreq 对
 * 行末字距与标点挤压的要求；`text-transform: uppercase` 对汉字完全无效，
 * 留着只是误导——读代码的人会以为它在起什么作用。
 *
 * 实现要点：
 *   - 单位要同时认 px 与 em（早期版本只认 px，漏掉了一律用 em 的规则）
 *   - 负值放行：收紧标题字距在中文里同样有效
 *   - 选择器要能跨行拼（多行规则块），单行规则也要能取到
 */
function checkCjkTracking() {
  const cssPath = join(SRC, 'ui.css');
  const src = readFileSync(cssPath, 'utf8');
  const rel = relative(ROOT, cssPath).replace(/\\/g, '/');

  // 把 CSS 拆成「选择器 + 声明体」，逐块检查
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = blockRe.exec(src)) !== null) {
    const selector = m[1].trim().split('\n').pop().trim();
    const body = m[2];
    const line = src.slice(0, m.index).split('\n').length;

    // 正 letter-spacing（px 与 em 都算；负值放行）
    for (const ls of body.matchAll(/letter-spacing\s*:\s*(-?[\d.]+)(px|em|rem)/g)) {
      if (Number(ls[1]) > 0) {
        fail(`${rel}:${line}：${selector} 用了正 letter-spacing ${ls[1]}${ls[2]}。汉字加字距会撑散字距、破坏中文行末对齐，标签请去掉 letter-spacing`);
      }
    }

    // text-transform: uppercase
    if (/text-transform\s*:\s*uppercase/i.test(body)) {
      fail(`${rel}:${line}：${selector} 用了 text-transform: uppercase。对汉字无效，若只是为了强调西文缩写，请改用字重或颜色`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 5. 焦点可见 / 6. 动效降级
 * ------------------------------------------------------------------ */

function checkFocusAndMotion() {
  const css = readFileSync(join(SRC, 'ui.css'), 'utf8');
  const rel = relative(ROOT, 'apps/web/src/ui.css').replace(/\\/g, '/');

  const hasFocus = /:focus-visible/.test(css);
  if (!hasFocus) fail(`${rel}：没有 :focus-visible 样式，键盘用户看不出焦点在哪`);

  const hasMotion = /transition\s*:/.test(css) || /animation\s*:/.test(css) || /@keyframes/.test(css);
  if (hasMotion && !/prefers-reduced-motion/.test(css)) {
    fail(`${rel}：有动效但没有 prefers-reduced-motion 兜底，前庭敏感用户无法关闭动效`);
  }
}

/* ------------------------------------------------------------------ *
 * 跑
 * ------------------------------------------------------------------ */

checkScaleIntegrity();
checkSpacing();
checkColorLiterals();
checkContrast();
checkCjkTracking();
checkFocusAndMotion();

console.log('');
if (fails.length) {
  console.log(`设计门禁：${fails.length} 条错误`);
  for (const f of fails) console.log(`  ✗ ${f}`);
} else {
  console.log('设计门禁：0 条错误');
}
if (warnings.length) {
  console.log(`${warnings.length} 条提醒`);
  for (const w of warnings) console.log(`  ! ${w}`);
}

if (fails.length && !warnOnly) process.exit(1);
