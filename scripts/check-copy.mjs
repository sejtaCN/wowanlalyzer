/**
 * 文案门禁：检查正文有没有 AI 腔、开发中间文字和没本地化的英文。
 *
 * 规则来自 content/guides/copy-rules.json（也就是 NGA 写法的那套设定）。
 * 与 scripts/validate-content.mjs 分工：
 *   validate-content 管「数字有没有出处」；
 *   check-copy 管「话有没有人味、有没有漏翻译、有没有夹带开发笔记」。
 *
 * 扫描范围按「读者层级」分级：
 *   攻略正文（content/chapters）→ 章节页组件（components）→ 应用层（views）
 *   前两级违规算错误，第三级只算提醒——应用层是工具页，不是攻略正文。
 *
 * 用法：npm run check:copy
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = JSON.parse(readFileSync(join(ROOT, 'content', 'guides', 'copy-rules.json'), 'utf8'));

const errors = [];
const warnings = [];

/* ---------- 收集要检查的文案片段 ---------- */

/** 章节里面向读者的字段 */
function chapterFragments(ch) {
  const out = [];
  const push = (where, text) => {
    if (typeof text === 'string' && text.trim()) out.push({ where, text });
  };
  push('title', ch.title);
  push('subtitle', ch.subtitle);
  push('claim', ch.claim);
  push('chart.title', ch.chart?.title);
  for (const s of [...(ch.priorityDiff?.add ?? []), ...(ch.priorityDiff?.drop ?? [])]) {
    push('priorityDiff.reason', s.reason);
    push('priorityDiff.evidence', s.evidence);
  }
  const cp = ch.casePanel ?? {};
  push('casePanel.headline', cp.headline);
  push('casePanel.reading', cp.reading);
  push('casePanel.reason', cp.reason);
  for (const p of cp.points ?? []) push('casePanel.points[]', p);
  return out;
}

/**
 * TSX 里面向读者的文案。用 TypeScript 语法树而不是跨 JSX 的正则：
 * - 中文字符串保留原扫描范围，避免漏掉先存变量再渲染的文案；
 * - 纯英文 / 机器字符串只在 JSX 文本、JSX 表达式或可见属性里采集；
 * - 字符串里的 < / > 只是文本，不再被当成标签边界丢掉。
 */
const VISIBLE_ATTRIBUTES = new Set(['alt', 'aria-label', 'aria-description', 'aria-valuetext', 'placeholder', 'title']);

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ');
  }
  return null;
}

function jsxContext(node) {
  let current = node;
  for (let parent = current.parent; parent; current = parent, parent = current.parent) {
    if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent)) continue;
    if (ts.isConditionalExpression(parent)) {
      if (parent.condition === current) return null;
      continue;
    }
    if (ts.isBinaryExpression(parent)) {
      if (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || parent.operatorToken.kind === ts.SyntaxKind.BarBarToken) continue;
      return null;
    }
    if (ts.isJsxExpression(parent)) {
      if (ts.isJsxAttribute(parent.parent)) continue;
      return 'tsx string';
    }
    if (ts.isJsxAttribute(parent)) {
      const name = parent.name.getText();
      return VISIBLE_ATTRIBUTES.has(name) ? 'tsx attr' : null;
    }
    return null;
  }
  return null;
}

function decodeJsxText(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function tsxFragments(file) {
  const src = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const push = (where, text, baseline = false) => {
    const clean = decodeJsxText(text).trim();
    if (clean) out.push({ where, text: clean, baseline });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const siblings = node.parent?.children ?? [];
      const mixed = siblings.some((sibling) => ts.isJsxExpression(sibling));
      const comparison = /[<>]|&(?:lt|gt);/.test(node.text);
      push('tsx jsx', node.text, mixed || comparison || !/[\u4e00-\u9fa5]/.test(node.text));
    }
    const text = literalText(node);
    if (text !== null) {
      const context = jsxContext(node);
      const chinese = /[\u4e00-\u9fa5]/.test(text);
      if (chinese || context) push(context ?? 'tsx string', text, !chinese || text.includes('<') || text.includes('>'));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function walk(dir, filter) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, filter));
    else if (filter(name)) out.push(full);
  }
  return out;
}

/* ---------- 各项检查 ---------- */

const bannedError = RULES.bannedWords.error;
const bannedWarn = RULES.bannedWords.warn;
const allowedLatin = new Set(RULES.latinPolicy.allowed);
const mustWrap = new Set(RULES.latinPolicy.mustWrapInBrackets);

/** 技术页里合理出现的词：它们是标识符不是漏译 */
const TECH_TERMS = new Set([
  'runId',
  'runIds',
  'L0',
  'L1',
  'L2',
  'profile',
  'commit',
  'SimC',
  'JSON',
  'CSV',
  'WebP',
  'HTML',
  'URL',
  'API',
  'ID',
]);

function checkFragment(frag, fileLabel, strict) {
  // 占位符是机器语法（{{bossDamageM}}），渲染时会被数字替换；先剥掉再做文案判断。
  const text = frag.text.replace(/\{\{\w+\}\}/g, '');
  const { where } = frag;
  const channel = strict && !frag.baseline ? errors : warnings;

  for (const w of bannedError) {
    if (!text.includes(w)) continue;
    channel.push(
      `${fileLabel} · ${where}：出现禁用词「${w}」 → ${text.slice(0, 60)}`,
    );
  }
  for (const w of bannedWarn) {
    if (text.includes(w)) warnings.push(`${fileLabel} · ${where}：出现 AI 腔词「${w}」 → ${text.slice(0, 60)}`);
  }

  // 没括起来的机器标识符
  for (const id of mustWrap) {
    const re = new RegExp(`(^|[^「])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^」]|$)`);
    if (re.test(text)) {
      channel.push(
        `${fileLabel} · ${where}：机器标识符「${id}」未用「」框住 → ${text.slice(0, 60)}`,
      );
    }
  }

  // 拉丁词组：要么整体是公认术语，要么每个词都在白名单里
  const stripped = text.replace(/「[^」]*」/g, '');
  for (const m of stripped.matchAll(/[A-Za-z][A-Za-z0-9_.\/-]*(?:[ ’'][A-Za-z][A-Za-z0-9_.\/-]*)*/g)) {
    const phrase = m[0].trim();
    if (phrase.length < 2) continue; // 单个字母是单位（M / s）或占位符
    const words = phrase.split(/[ ’']/);
    const ok =
      allowedLatin.has(phrase) ||
      words.every((w) => allowedLatin.has(w) || TECH_TERMS.has(w));
    if (ok) continue;
    if (/^[A-Z]{2,}$/.test(phrase)) continue; // 全大写缩写
    channel.push(
      `${fileLabel} · ${where}：未本地化英文「${phrase}」 → ${text.slice(0, 60)}`,
    );
  }

  // 三段式 AI 腔：一句里三个以上分号
  const semis = (text.match(/；/g) ?? []).length;
  if (semis >= 3) warnings.push(`${fileLabel} · ${where}：一句里 ${semis} 个分号，像三段式套话 → ${text.slice(0, 60)}`);
}

/* ---------- 长度预算 ---------- */

function checkLengths(ch, fileLabel) {
  const budget = RULES.lengthBudget;
  const check = (where, text, max) => {
    if (!text) return;
    if (text.length > max) warnings.push(`${fileLabel} · ${where}：${text.length} 字，超过 ${max} 字上限`);
  };
  check('subtitle', ch.subtitle, budget.subtitle.max);
  // claim 里的数字是占位符，按渲染后的长度算：每个占位符保守按 5 个字符（如 12.7M）估。
  check('claim', ch.claim ? ch.claim.replace(/\{\{\w+\}\}/g, '00.0M') : ch.claim, budget.claim.max);
  for (const s of [...(ch.priorityDiff?.add ?? []), ...(ch.priorityDiff?.drop ?? [])]) {
    check('priorityDiff.reason', s.reason, budget['priorityDiff.reason'].max);
    check('priorityDiff.evidence', s.evidence, budget['priorityDiff.evidence'].max);
  }
  for (const p of ch.casePanel?.points ?? []) {
    check('casePanel.points[]', p, budget['casePanel.points[].max'].max);
  }
}

/* ---------- 优先级依据与 APL 原文的对应关系 ---------- */

/** 技能键 → 中文名，用来判断依据有没有对上原文 */
const SKILL_ZH = (() => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'content', 'guides', 'skills.json'), 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(raw.skills ?? {})) if (v.zh) out[k] = v.zh;
  return out;
})();

/** APL 里没有辨识度的通用词：出现与否不说明依据写对没写对 */
const GENERIC = new Set([
  'actions', 'main', 'cds', 'precombat', 'aoe', 'max', 'min', 'chain', 'interrupt',
  'if', 'target', 'in', 'flight', 'up', 'react', 'remains', 'ready', 'enabled',
  'refreshable', 'ticking', 'name', 'value', 'op', 'default', 'target_if',
  'call_action_list', 'run_action_list', 'variable', 'skill', 'action', 'dot',
  'buff', 'cooldown', 'talent', 'potion', 'set_bonus', 'mid2', '4pc', 'priest',
  'pet', 'raid_event', 'trinket', 'has_buff', 'adds', 'exists', 'prev_gcd',
  'gcd', 'insanity', 'deficit', 'time_to_die', 'health', 'pct', 'fight_remains',
  'active_enemies', 'active_dot', 'full_recharge_time', 'usable_in', 'forced',
  'has_absorb', 'targetSelect',
]);

function checkEvidenceMatchesRaw(ch, fileLabel) {
  for (const arr of [ch.priorityDiff?.add ?? [], ch.priorityDiff?.drop ?? []]) {
    // 同一组里，两条不同条件不能共用同一句依据
    const seen = new Map();
    for (const it of arr) {
      const ev = (it.evidence ?? '').trim();
      if (!ev || !it.raw) continue;
      const prev = seen.get(ev);
      if (prev && prev.raw !== it.raw) {
        errors.push(
          `${fileLabel} · priorityDiff：${it.skill} 与 ${prev.skill} 的依据完全相同，但两条的 APL 原文不同——依据写串了`,
        );
      }
      seen.set(ev, it);
    }

    // 依据必须对得上自己的 APL 原文：原文里的标识符，依据要么照抄要么给中文说法
    for (const it of arr) {
      if (!it.raw) continue;
      const ids = [
        ...new Set(
          [...it.raw.matchAll(/[a-z_][a-z_0-9]*/g)].map((m) => m[0]).filter((t) => !GENERIC.has(t)),
        ),
      ];
      if (!ids.length) continue;
      const ok = ids.some(
        (t) => it.evidence.includes(t) || (SKILL_ZH[t] && it.evidence.includes(SKILL_ZH[t])),
      );
      if (!ok) {
        errors.push(
          `${fileLabel} · priorityDiff：${it.skill} 的依据没对上它的 APL 原文（${ids.join(' / ')}）→ ${it.evidence.slice(0, 50)}`,
        );
      }
    }
  }
}

/* ---------- 页面直接渲染的 JSON 字段 ---------- */

function visibleJsonFragments(relativePath) {
  const doc = JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
  const out = [];
  const push = (where, text) => {
    if (typeof text === 'string' && text.trim()) out.push({ where, text });
  };

  if (relativePath === 'content/coaching/general.json') {
    push('title', doc.title);
    push('subtitle', doc.subtitle);
    push('hero', doc.hero);
    for (const [index, item] of (doc.items ?? []).entries()) {
      push(`items[${index}].title`, item.title);
      push(`items[${index}].why`, item.why);
      push(`items[${index}].do`, item.do);
      for (const text of item.evidence ?? []) push(`items[${index}].evidence[]`, text);
    }
  } else if (relativePath === 'content/specs.json') {
    for (const [index, spec] of (doc.specs ?? []).entries()) {
      for (const key of ['className', 'name', 'short', 'baseline']) push(`specs[${index}].${key}`, spec[key]);
      for (const [heroIndex, hero] of (spec.heroTrees ?? []).entries()) push(`specs[${index}].heroTrees[${heroIndex}].name`, hero.name);
    }
  } else if (relativePath === 'content/guides/sources-summary.json') {
    push('baseline', doc.baseline);
    push('howWeUse', doc.howWeUse);
    for (const [index, source] of (doc.sources ?? []).entries()) {
      for (const key of ['name', 'version', 'type', 'feature', 'limit']) push(`sources[${index}].${key}`, source[key]);
      for (const text of source.points ?? []) push(`sources[${index}].points[]`, text);
    }
  } else if (relativePath === 'content/guides/crosscheck-archon.json') {
    for (const [index, item] of (doc.agreements ?? []).entries()) {
      push(`agreements[${index}].point`, item.point);
      push(`agreements[${index}].detail`, item.detail);
    }
    for (const [index, item] of (doc.divergences ?? []).entries()) {
      for (const key of ['point', 'method', 'maxroll', 'nga', 'detail', 'verdict', 'apl']) push(`divergences[${index}].${key}`, item[key]);
    }
  }
  return out;
}

/* ---------- 跑 ---------- */

const chaptersDir = join(ROOT, 'content', 'chapters');
for (const file of readdirSync(chaptersDir).filter((f) => f.endsWith('.json'))) {
  const ch = JSON.parse(readFileSync(join(chaptersDir, file), 'utf8'));
  const label = `content/chapters/${file}`;
  for (const frag of chapterFragments(ch)) checkFragment(frag, label, true);
  checkLengths(ch, label);
  checkEvidenceMatchesRaw(ch, label);
}

// 章节页组件：攻略正文在页面上长什么样，这里也要守住
for (const file of walk(join(ROOT, 'apps', 'web', 'src', 'components'), (n) => n.endsWith('.tsx'))) {
  const rel = file.replace(/\\/g, '/').replace(/^.*apps\//, 'apps/');
  for (const frag of tsxFragments(file)) checkFragment(frag, rel, true);
}

// 应用层：入口与工具页只提醒；ComingSoon 是本轮明确延期项，不扫描。
const deferred = RULES.coverage?.deferred ?? [];
const deferredPaths = new Set(deferred.map((item) => item.path));
const appEntry = RULES.coverage?.applicationEntry ?? 'apps/web/src/App.tsx';
const appEntryAbs = join(ROOT, appEntry);
if (existsSync(appEntryAbs)) {
  for (const frag of tsxFragments(appEntryAbs)) checkFragment(frag, appEntry, false);
}
for (const file of walk(join(ROOT, 'apps', 'web', 'src', 'views'), (n) => n.endsWith('.tsx'))) {
  const rel = file.replace(/\\/g, '/').replace(/^.*apps\//, 'apps/');
  if (deferredPaths.has(rel)) continue;
  for (const frag of tsxFragments(file)) checkFragment(frag, rel, false);
}

// 页面直接渲染的非章节 JSON：本批建立基线，先走提醒通道。
for (const rel of RULES.coverage?.visibleJson ?? []) {
  for (const frag of visibleJsonFragments(rel)) checkFragment(frag, rel, false);
}

/* ---------- 输出 ---------- */

for (const item of deferred) console.log(`deferred: ${item.label}（${item.path}；本轮不扫描、不计入错误或提醒）`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✗ ${e}`);

console.log(
  `\n文案门禁：${errors.length} 条错误 / ${warnings.length} 条提醒。` + (errors.length ? '' : '通过。'),
);
process.exit(errors.length ? 1 : 0);
