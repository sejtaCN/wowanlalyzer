// 门禁：docs/nga-copy-spec.md 的 §4 必须与 content/chapters/*.json 逐字一致。
//
// 为什么要有这个门禁：
//   交付文档 §4 是「重写后的完整攻略正文」的正式版本，读者按它读；代码里跑的是
//   content/chapters/*.json。两边一旦漂移，文档就在骗人——而 NGA 排版篇最看重的是
//   「正文和依据一一对应」。上一轮把「APL 原文」改成「APL 条件」时，JSON 改了、
//   文档没改，21 条依据当场对不上。这个门禁就是为拦住这类漂移。
//
// 判定按 §4 的语法逐条对，不做模糊匹配：
//   - **副标题 / 结论 / 图题** 对应 JSON 的 subtitle / claim / chart.title。
//   - **优先级·加 / 优先级·降** 对应 priorityDiff.add / drop，组内按序 zip。
//     文档行写成「技能名：理由」，JSON 里技能名是独立字段、理由是 reason，
//     所以判据是「文档行以 JSON 的 reason 结尾且前缀非空」——技能名怎么写随文档，
//     理由一个字不许差；下面那条「依据：」必须逐字等于 JSON 的 evidence。
//   - **对照** 对应 casePanel.headline，下面每条对应 points / evidence / reading。
//   - **缺对照** 对应 casePanel.reason。
//
// 顺带扫 §4 的乱码（U+FFFD）。

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DOC = 'docs/nga-copy-spec.md';
const CH_DIR = 'content/chapters';

const errors = [];

// ---------- 取 §4 ----------
/** Windows 检出通常使用 CRLF；校验内容前统一换行，避免行尾让 `$` 失配。 */
function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

const doc = normalizeNewlines(readFileSync(DOC, 'utf8'));
const secStart = doc.indexOf('## §4 ');
if (secStart < 0) errors.push(`${DOC}: 找不到「## §4」小节`);
const secEnd = doc.indexOf('\n## ', secStart + 1);
const sec = doc.slice(secStart, secEnd < 0 ? undefined : secEnd);

// ---------- 解析 §4：按章节切成块 ----------
// 章节标题形如「### L0-01 暗牧在做什么」
const marks = [];
const re = /^### (L\d-\d+) (.*)$/gm;
let m;
while ((m = re.exec(sec)) !== null) marks.push({ id: m[1], title: m[2], at: m.index });
const blocks = [];
for (let i = 0; i < marks.length; i++) {
  const from = marks[i].at;
  const to = i + 1 < marks.length ? marks[i + 1].at : sec.length;
  blocks.push({ id: marks[i].id, title: marks[i].title, body: sec.slice(from, to) });
}
if (!blocks.length) errors.push(`${DOC}: §4 里没有解析到任何章节块`);

// ---------- 解析章节块 ----------
// 返回 [{label, value, subs:[{kind,text}]}]，缩进的行归属上一个顶层 bullet。
function parseBlock(body) {
  const items = [];
  for (const line of body.split('\n')) {
    let t = /^- \*\*(.+?)\*\*[｜:：](.*)$/.exec(line);
    if (t) {
      items.push({ label: t[1], value: t[2].trim(), subs: [] });
      continue;
    }
    t = /^ {2}- (依据|证据|读法)：?(.*)$/.exec(line);
    if (t) {
      const kind = t[1] === '依据' ? 'evidence' : t[1] === '证据' ? 'proof' : 'reading';
      const last = items[items.length - 1];
      if (last) last.subs.push({ kind, text: t[2].trim() });
      continue;
    }
    t = /^ {2}- (?!依据|证据|读法)(.+)$/.exec(line);
    if (t) {
      const last = items[items.length - 1];
      if (last) last.subs.push({ kind: 'point', text: t[1].trim() });
    }
  }
  return items;
}

// 直接验证同一个解析器在 LF / CRLF 下得到一致结果。CI 和本地都可单独运行。
if (process.argv.includes('--self-test')) {
  const sample = [
    '### L0-01 测试',
    '',
    '- **副标题**：副标题',
    '- **结论**：结论',
    '- **图题**：图题',
    '- **优先级·加**｜技能：理由',
    '  - 依据：依据',
    '- **对照**：对照',
    '  - 读法：读法',
  ].join('\n');
  const parse = (text) => parseBlock(normalizeNewlines(text));
  const lf = parse(sample);
  const crlf = parse(sample.replace(/\n/g, '\r\n'));
  const ok = JSON.stringify(lf) === JSON.stringify(crlf) && lf.length === 5;
  if (!ok) {
    console.error('✗ check:doc 换行自测失败：LF / CRLF 解析结果不一致');
    process.exit(1);
  }
  console.log('✓ check:doc 换行自测通过：LF / CRLF 解析一致');
  process.exit(0);
}

// ---------- 读 JSON ----------
const files = readdirSync(CH_DIR).filter((f) => f.endsWith('.json'));
const chapters = [];
for (const f of files) chapters.push(JSON.parse(readFileSync(join(CH_DIR, f), 'utf8')));

// 章节 id → 文档小节号（l0-01-what-shadow-does → L0-01）
function docKey(j) {
  const mm = /^([lL]\d-\d\d)/.exec(j.id);
  return mm ? mm[1].toUpperCase() : j.id.toUpperCase();
}

function eq(a, b) {
  return typeof a === 'string' && a === b;
}

// ---------- 逐章比对 ----------
let checked = 0;
for (const j of chapters) {
  const key = docKey(j);
  const block = blocks.find((b) => b.id.toUpperCase() === key);
  if (!block) {
    errors.push(`${DOC}: §4 缺少章节「${key}」（${j.title}）`);
    continue;
  }
  checked++;

  if (block.title !== j.title) {
    errors.push(`${DOC} §4 ${key}: 标题不一致 → 文档「${block.title}」/ JSON「${j.title}」`);
  }

  const items = parseBlock(block.body);
  const cp = j.casePanel ?? {};

  // ---- 副标题 / 结论 / 图题 ----
  const one = (label, expected) => {
    const it = items.find((x) => x.label === label);
    if (!it) { errors.push(`${DOC} §4 ${key}: 缺少「${label}」`); return; }
    if (!eq(it.value, expected)) {
      errors.push(`${DOC} §4 ${key}: 「${label}」与 JSON 不一致 → 文档「${it.value.slice(0, 50)}」/ JSON「${String(expected ?? '').slice(0, 50)}」`);
    }
  };
  one('副标题', j.subtitle);
  one('结论', j.claim);
  one('图题', j.chart?.title);

  // ---- 优先级：组内按序 zip ----
  for (const [label, group, list] of [
    ['优先级·加', 'add', j.priorityDiff?.add ?? []],
    ['优先级·降', 'drop', j.priorityDiff?.drop ?? []],
  ]) {
    const docItems = items.filter((x) => x.label === label);
    if (docItems.length !== list.length) {
      errors.push(`${DOC} §4 ${key}: 「${label}」条数不一致 → 文档 ${docItems.length} / JSON ${list.length}`);
      continue;
    }
    docItems.forEach((d, i) => {
      const e = list[i];
      const reason = e?.reason;
      if (typeof reason === 'string' && reason) {
        if (!d.value.endsWith(reason)) {
          errors.push(`${DOC} §4 ${key}: 「${label}」第 ${i + 1} 条与 JSON 的 reason 对不上 → 文档「${d.value.slice(0, 50)}」/ JSON「${reason.slice(0, 50)}」`);
        } else if (!d.value.slice(0, d.value.length - reason.length).trim()) {
          errors.push(`${DOC} §4 ${key}: 「${label}」第 ${i + 1} 条缺少技能名前缀 → 「${d.value.slice(0, 50)}」`);
        }
      }
      const ev = d.subs.find((s) => s.kind === 'evidence');
      if (typeof e?.evidence === 'string') {
        if (!ev) errors.push(`${DOC} §4 ${key}: 「${label}」第 ${i + 1} 条缺少「依据：」`);
        else if (!eq(ev.text, e.evidence)) {
          errors.push(`${DOC} §4 ${key}: 「${label}」第 ${i + 1} 条的依据与 JSON 不一致 → 文档「${ev.text.slice(0, 50)}」/ JSON「${e.evidence.slice(0, 50)}」`);
        }
      }
    });
  }

  // ---- 对照 / 缺对照 ----
  const dui = items.find((x) => x.label === '对照');
  const que = items.find((x) => x.label === '缺对照');
  if (dui) {
    if (!eq(dui.value, cp.headline)) {
      errors.push(`${DOC} §4 ${key}: 「对照」与 casePanel.headline 不一致 → 文档「${dui.value.slice(0, 50)}」/ JSON「${String(cp.headline ?? '').slice(0, 50)}」`);
    }
    const docPoints = dui.subs.filter((s) => s.kind === 'point').map((s) => s.text);
    const jsonPoints = (cp.points ?? []).map((p) => (typeof p === 'string' ? p : p?.text)).filter(Boolean);
    if (docPoints.length !== jsonPoints.length) {
      errors.push(`${DOC} §4 ${key}: 「对照」条目数不一致 → 文档 ${docPoints.length} / JSON ${jsonPoints.length}`);
    } else {
      docPoints.forEach((p, i) => {
        if (!eq(p, jsonPoints[i])) {
          errors.push(`${DOC} §4 ${key}: 「对照」第 ${i + 1} 条不一致 → 文档「${p.slice(0, 50)}」/ JSON「${String(jsonPoints[i]).slice(0, 50)}」`);
        }
      });
    }
    const proof = dui.subs.find((s) => s.kind === 'proof');
    if (typeof cp.evidence === 'string' && cp.evidence) {
      if (!proof) errors.push(`${DOC} §4 ${key}: 「对照」缺少「证据：」`);
      else if (!eq(proof.text, cp.evidence)) {
        errors.push(`${DOC} §4 ${key}: 「对照」的证据与 casePanel.evidence 不一致 → 文档「${proof.text.slice(0, 50)}」/ JSON「${cp.evidence.slice(0, 50)}」`);
      }
    }
    const reading = dui.subs.find((s) => s.kind === 'reading');
    const jsonReading = typeof cp.reading === 'string' ? cp.reading : null;
    if (jsonReading) {
      if (!reading) errors.push(`${DOC} §4 ${key}: 「对照」缺少「读法：」`);
      else if (!eq(reading.text, jsonReading)) {
        errors.push(`${DOC} §4 ${key}: 「读法」与 casePanel.reading 不一致 → 文档「${reading.text.slice(0, 50)}」/ JSON「${jsonReading.slice(0, 50)}」`);
      }
    }
  } else if (que) {
    if (!eq(que.value, cp.reason)) {
      errors.push(`${DOC} §4 ${key}: 「缺对照」与 casePanel.reason 不一致 → 文档「${que.value.slice(0, 50)}」/ JSON「${String(cp.reason ?? '').slice(0, 50)}」`);
    }
  } else {
    errors.push(`${DOC} §4 ${key}: 既没有「对照」也没有「缺对照」`);
  }

  // ---- 顶层 bullet 种类不该有多余的 ----
  const ALLOWED = new Set(['副标题', '结论', '图题', '优先级·加', '优先级·降', '对照', '缺对照']);
  for (const it of items) {
    if (!ALLOWED.has(it.label)) errors.push(`${DOC} §4 ${key}: 出现未知的顶层标签「${it.label}」`);
  }
}

// 多余的章节块
for (const b of blocks) {
  if (!chapters.some((j) => docKey(j) === b.id.toUpperCase())) {
    errors.push(`${DOC} §4: 多出章节块「${b.id}」`);
  }
}

// ---------- 乱码扫描 ----------
const mojibake = sec.match(/[\uFFFD]/g);
if (mojibake) errors.push(`${DOC} §4: 出现 ${mojibake.length} 个乱码字符（U+FFFD）`);

// ---------- 输出 ----------
if (errors.length) {
  console.error(`✗ 文档与落盘内容不一致：${errors.length} 条`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ 文档 §4 与落盘内容逐字一致：${checked} 章 / ${blocks.length} 节`);
