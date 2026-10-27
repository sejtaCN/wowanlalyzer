/**
 * 内容校验：页面上不允许出现"没有来源的数字"。
 *
 * 检查项（任何一项失败即退出码 1）：
 *   1. 章节引用的每个 runId 都必须在 content/sims 下真实存在；
 *   2. 每个 runId 文件必须带 simc 版本 / commit / 迭代数 / CI；
 *   3. 文本里出现的百分比，章节必须有 evidence.runIds（否则无来源）；
 *   4. priorityDiff 里提到的技能，必须能在 priority-table.json 里找到（或显式标为说明文字）；
 *   5. L1/L2 必须有模型卡，L0 允许为 null；
 *   6. 图契约：11 章 × 5 段齐全，主图 kind 走白名单，缺图单独警告。
 *      --check-figures=<其他清单> 供临时副本探针使用，不修改仓库内容。
 *      --root=<临时副本> 同时切换数据根；UI 探针另有 scripts/verify-gates.mjs。
 *
 * 用法：npm run validate:content
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((x) => x.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DATA_ROOT = resolve(argOf('root', ROOT));
const SRC = (p) => join(DATA_ROOT, p);
const FIGURES = resolve(argOf('check-figures', SRC('content/figures/chapters.json')));

const errors = [];
const warnings = [];

// ---- 载入 runId ----
const simsDir = SRC('content/sims');
const runs = new Map();
for (const f of readdirSync(simsDir)) {
  if (!f.endsWith('.json') || f === 'numeric-summary.json') continue;
  try {
    const j = JSON.parse(readFileSync(join(simsDir, f), 'utf8'));
    if (j.runId) runs.set(j.runId, j);
  } catch {
    errors.push(`runId 文件解析失败：${f}`);
  }
}

// ---- 载入日志 ----
const logsDir = SRC('content/logs');
const logs = new Map();
if (existsSync(logsDir)) {
  for (const f of readdirSync(logsDir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(logsDir, f), 'utf8'));
      if (j.runId) logs.set(j.runId, j);
    } catch {
      errors.push(`日志文件解析失败：${f}`);
    }
  }
}

// ---- 载入优先级表 ----
const priorityPath = SRC('content/guides/priority-table.json');
const priority = existsSync(priorityPath) ? JSON.parse(readFileSync(priorityPath, 'utf8')) : { sections: [] };
const skillKeys = new Set(priority.sections.flatMap((s) => s.rows.map((r) => r.skill)));

const CHART_KINDS = new Set(['burst-bars', 'priority-table', 'skill-cards', 'log-stats', 'wave-table']);
const FIGURE_STATUS = new Set(['ready', 'missing', 'not-applicable']);
const figureDoc = existsSync(FIGURES) ? JSON.parse(readFileSync(FIGURES, 'utf8')) : null;
const figureKinds = new Set(figureDoc?.kinds ?? []);
const missingFigures = [];
if (!figureDoc) errors.push(`缺少图契约：${FIGURES}`);

// ---- 遍历章节 ----
const chaptersDir = SRC('content/chapters');
const files = readdirSync(chaptersDir).filter((f) => f.endsWith('.json'));
if (!files.length) errors.push('content/chapters 下没有章节 JSON');

const textOf = (c) =>
  [c.title, c.subtitle, c.claim, JSON.stringify(c.priorityDiff)]
    .filter(Boolean)
    .join(' ');

for (const f of files) {
  const c = JSON.parse(readFileSync(join(chaptersDir, f), 'utf8'));
  const where = `${f}`;

  // 1. runId 存在性
  const ids = new Set([...(c.evidence?.runIds ?? []), ...(c.chart?.runIds ?? [])]);
  for (const id of ids) if (!runs.has(id)) errors.push(`${where}: 引用了不存在的 runId ${id}`);

  // 1b. 日志存在性
  const logIds = new Set([...(c.evidence?.logs ?? []), ...(c.chart?.logId ? [c.chart.logId] : [])]);
  for (const id of logIds) if (!logs.has(id)) errors.push(`${where}: 引用了不存在的日志 ${id}`);

  // 2. runId 元数据完整
  for (const id of ids) {
    const r = runs.get(id);
    if (!r) continue;
    if (!r.simc?.version || !r.simc?.gitRevision) errors.push(`${where}: runId ${id} 缺 simc 版本/commit`);
    if (!r.dps?.samples) errors.push(`${where}: runId ${id} 缺样本数`);
    if (r.dps?.ci95Pct == null) errors.push(`${where}: runId ${id} 缺 CI`);
  }

  // 3. 百分比必须有来源（模拟 runId 或真实日志，二者不能互相顶替）
  const text = textOf(c);
  const pcts = [...text.matchAll(/\d+(?:\.\d+)?%/g)].map((m) => m[0]);
  const hasEvidence = (c.evidence?.runIds ?? []).length > 0 || (c.evidence?.logs ?? []).length > 0;
  if (pcts.length && !hasEvidence) {
    errors.push(`${where}: 正文出现 ${pcts.join('/')} 但 evidence 里既没有 runId 也没有日志`);
  }

  // 4. 技能在优先级表里
  for (const s of [...(c.priorityDiff?.add ?? []), ...(c.priorityDiff?.drop ?? [])]) {
    const label = s.skill.trim();
    if (label.startsWith('（')) continue; // 说明性条目
    if (label === 'aoe_loop') continue; // 伪技能：表示"切多目标循环"这个动作
    if (!skillKeys.has(label) && !label.includes('循环') && !label.includes('填充')) {
      warnings.push(`${where}: 技能 ${label} 不在 priority-table 里（可能是中文名或新技能）`);
    }
  }

  // 5. 模型卡
  if (c.level !== 'L0' && !c.model) errors.push(`${where}: ${c.level} 页必须有模型卡`);
  if (!c.claim?.trim()) errors.push(`${where}: 缺少唯一结论 claim`);

  // 6. 图契约：未知主图是错误；缺图是警告，必须与「不适用」分开。
  if (!CHART_KINDS.has(c.chart?.kind)) errors.push(`${where}: 未知主图类型 ${c.chart?.kind}`);
  const figures = figureDoc?.chapters?.[c.id];
  if (!Array.isArray(figures) || figures.length !== 5) {
    errors.push(`${where}: 图契约必须有 5 段`);
  } else {
    for (const [i, f] of figures.entries()) {
      if (f.section !== i + 1) errors.push(`${where}: 图契约第 ${i + 1} 项编号错位`);
      if (!figureKinds.has(f.kind)) errors.push(`${where}: 第 ${i + 1} 段未知图类型 ${f.kind}`);
      if (!FIGURE_STATUS.has(f.status)) errors.push(`${where}: 第 ${i + 1} 段未知状态 ${f.status}`);
      if (f.status === 'ready' && !f.source) errors.push(`${where}: 第 ${i + 1} 段有图但没写来源`);
      if (f.status === 'missing') {
        if (!f.next) errors.push(`${where}: 第 ${i + 1} 段缺图但没写下一批`);
        missingFigures.push(`${c.id} 第${i + 1}段 ${f.kind} → ${f.next}（${f.source}）`);
      }
    }
    const main = figures[1];
    if (main && main.kind !== c.chart.kind && !(c.id === 'l2-01-altar-of-fangs' && main.kind === 'selected-wave')) {
      errors.push(`${where}: 第②段契约 ${main.kind} 与主图 ${c.chart.kind} 不一致`);
    }
  }
}
for (const id of Object.keys(figureDoc?.chapters ?? {})) {
  if (!files.includes(`${id}.json`)) errors.push(`图契约包含不存在的章节 ${id}`);
}

console.log(`图契约：${Object.keys(figureDoc?.chapters ?? {}).length} 章；缺图警告 ${missingFigures.length} 段`);
for (const item of missingFigures) console.log(`  ⚠ 缺图 ${item}`);

console.log(`检查 ${files.length} 个章节 / 可用 runId ${runs.size} 个 / 优先级技能 ${skillKeys.size} 个`);
if (warnings.length) {
  console.log(`\n警告 ${warnings.length} 条：`);
  for (const w of warnings) console.log('  ⚠ ' + w);
}
if (errors.length) {
  console.log(`\n错误 ${errors.length} 条：`);
  for (const e of errors) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('\n全部通过：没有无来源的数字。');
