/**
 * 内容校验：页面上不允许出现"没有来源的数字"。
 *
 * 检查项（任何一项失败即退出码 1）：
 *   1. 章节引用的每个 runId 都必须在 content/sims 下真实存在；
 *   2. 每个 runId 文件必须带 simc 版本 / commit / 迭代数 / CI；
 *   3. 文本里出现的百分比，章节必须有 evidence.runIds（否则无来源）；
 *      例外是标注「APL 条件」的逐字引用——那是机器条件，不是自测数字；
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
const CHAPTERS_DIR = resolve(argOf('check-chapters', SRC('content/chapters')));

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

// ---- 外部路线来源：引用与可复现字段必须齐全 ----
const routePath = SRC('content/routes/waves-altar-of-fangs.json');
if (existsSync(routePath)) {
  const route = JSON.parse(readFileSync(routePath, 'utf8'));
  if (!route.sourceUrl?.startsWith('https://keystone.guru/route/')) {
    errors.push('路线来源必须是 Keystone 完整路线 URL，不能是短链或搜索页');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(route.fetchedAt ?? '')) {
    errors.push('路线缺少 YYYY-MM-DD 格式的 fetchedAt');
  }
  if (!route.mappingVersion || !route.mdtMappingHash) {
    errors.push('路线缺少 mappingVersion / mdtMappingHash');
  }
  if (!Array.isArray(route.waves) || route.waves.length !== route.pulls) {
    errors.push('路线 pulls 与 waves 数量不一致');
  }
  let forceSum = 0;
  for (const wave of route.waves ?? []) {
    if (!Array.isArray(wave.enemyIds) || wave.enemyIds.length !== wave.mobCount) {
      errors.push(`路线第 ${wave.pull} pull 的 enemyIds 与 mobCount 不一致`);
    }
    if (wave.enemyPositions?.length !== wave.enemyIds?.length) {
      errors.push(`路线第 ${wave.pull} pull 缺少敌人坐标`);
    }
    forceSum += wave.forces ?? 0;
  }
  if (route.totalForces != null && forceSum !== route.totalForces) {
    errors.push(`路线 forces 不一致：声明 ${route.totalForces} / 逐波合计 ${forceSum}`);
  }
  if (route.requiredForces == null) errors.push('路线缺少 requiredForces');
}

const CHART_KINDS = new Set(['burst-bars', 'priority-table', 'skill-cards', 'log-stats', 'wave-table']);
const FIGURE_STATUS = new Set(['ready', 'missing', 'not-applicable']);
const ARCHON_PROFILE_ID = 'archon';
const activeHero = priority.hero ?? null;
if (activeHero && activeHero !== ARCHON_PROFILE_ID) {
  errors.push(`优先级表归属 ${activeHero}，当前站点只开放 ${ARCHON_PROFILE_ID}`);
}
const figureDoc = existsSync(FIGURES) ? JSON.parse(readFileSync(FIGURES, 'utf8')) : null;
const figureKinds = new Set(figureDoc?.kinds ?? []);
const missingFigures = [];
if (!figureDoc) errors.push(`缺少图契约：${FIGURES}`);

// ---- 遍历章节 ----
const chaptersDir = CHAPTERS_DIR;
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
  for (const id of ids) {
    const run = runs.get(id);
    if (!run) continue;
    const owner = run.profileId ?? run.hero ?? null;
    if (!owner) errors.push(`${where}: runId ${id} 没有 hero/profileId，当前无法安全归属`);
    else if (owner !== ARCHON_PROFILE_ID) {
      errors.push(`${where}: runId ${id} 属于 ${owner}，当前 Archon-only 不允许引用`);
    }
  }

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
  //    例外：明确标注「APL 条件」的阈值算有出处——那是逐字引用的机器条件（APL 与
  //    priority-table.json 都在仓库里），不是自己测出来的数字。其它任何百分比照旧必须有来源。
  const plain = [c.title, c.subtitle, c.claim].filter(Boolean);
  for (const s of [...(c.priorityDiff?.add ?? []), ...(c.priorityDiff?.drop ?? [])]) {
    for (const field of [s.reason, s.evidence]) {
      if (!field) continue;
      if (/APL 条件/.test(field)) continue;
      plain.push(field);
    }
  }
  const pcts = [...plain.join(' ').matchAll(/\d+(?:\.\d+)?%/g)].map((m) => m[0]);
  const hasEvidence = (c.evidence?.runIds ?? []).length > 0 || (c.evidence?.logs ?? []).length > 0;
  if (pcts.length && !hasEvidence) {
    errors.push(`${where}: 正文出现 ${pcts.join('/')} 但 evidence 里既没有 runId 也没有日志`);
  }

  // 4. 技能在优先级表里
  //    本构建用不上的行（种族 / 天赋 / 装备 / 队友）被章节当成"该用的技能"引用时要点名：
  //    条件型（血量没触发）不算——那是木桩测不到，实战仍要按条件用。
  const deadSkills = new Map(
    priority.sections
      .flatMap((s) => s.rows)
      .filter((r) => r.dead && r.dead.kind !== 'condition')
      .map((r) => [r.skill, r.dead.reason]),
  );
  for (const s of [...(c.priorityDiff?.add ?? []), ...(c.priorityDiff?.drop ?? [])]) {
    const label = s.skill.trim();
    if (label.startsWith('（')) continue; // 说明性条目
    if (label === 'aoe_loop') continue; // 伪技能：表示"切多目标循环"这个动作
    if (deadSkills.has(label)) {
      // 已经写明「本角色」限制的条目不算：那是把这条当限制讲，不是教读者去用。
      const acknowledged = /本角色|用不上|测不到/.test(`${s.reason ?? ''}${s.evidence ?? ''}`);
      if (!acknowledged) {
        warnings.push(`${where}: 引用了本构建用不上的技能 ${label}（${deadSkills.get(label)}）`);
      }
    } else if (!skillKeys.has(label) && !label.includes('循环') && !label.includes('填充')) {
      warnings.push(`${where}: 技能 ${label} 不在 priority-table 里（可能是中文名或新技能）`);
    }
  }

  // 4b. claim：正文数字必须全部是占位符，占位符与取值规则一一对应
  if (c.claim) {
    const placeholders = [...c.claim.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const bare = c.claim.replace(/\{\{\w+\}\}/g, '');
    const literals = bare.match(/\d+(?:\.\d+)?/g) ?? [];
    if (literals.length) {
      errors.push(`${where}: claim 里写死了数字 ${literals.join('/')}，改成 {{占位符}} 挂 runId`);
    }
    const specs = c.claimFields ?? {};
    for (const name of placeholders) {
      const spec = specs[name];
      if (!spec) {
        errors.push(`${where}: claim 占位符 {{${name}}} 没有 claimFields 取值规则`);
        continue;
      }
      if (spec.of) {
        if (spec.field !== 'ratioPct') errors.push(`${where}: claim 占位符 {{${name}}} 用 of 时必须 field=ratioPct`);
        for (const ref of spec.of) {
          if (!specs[ref]) errors.push(`${where}: claim 占位符 {{${name}}} 引用了未定义字段 ${ref}`);
        }
        continue;
      }
      const ids = spec.pair ?? (spec.runId ? [spec.runId] : []);
      if (!ids.length) errors.push(`${where}: claim 占位符 {{${name}}} 既没有 pair 也没有 runId`);
      for (const id of ids) {
        if (!runs.has(id)) errors.push(`${where}: claim 占位符 {{${name}}} 引用了不存在的 runId ${id}`);
      }
      if (spec.runId && !['durationSec', 'targets'].includes(spec.field)) {
        errors.push(`${where}: claim 占位符 {{${name}}} 单 runId 只能取 durationSec / targets`);
      }
    }
    for (const name of Object.keys(specs)) {
      const referenced = placeholders.includes(name) || Object.values(specs).some((sp) => (sp.of ?? []).includes(name));
      if (!referenced) warnings.push(`${where}: claimFields.${name} 没有被任何占位符引用`);
    }
  } else if (c.claimFields) {
    errors.push(`${where}: 有 claimFields 但没有 claim 模板`);
  }

  // 5. 模型卡
  if (c.level !== 'L0' && !c.model) errors.push(`${where}: ${c.level} 页必须有模型卡`);

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
    // L2 副本章的第②段固定是「选中的这一波值多少」（selected-wave），与主图声明无关，
    // 所以按层级放行，不按章节 id 写死——新增副本不该再改一次校验脚本。
    if (main && main.kind !== c.chart.kind && !(c.level === 'L2' && main.kind === 'selected-wave')) {
      errors.push(`${where}: 第②段契约 ${main.kind} 与主图 ${c.chart.kind} 不一致`);
    }
  }
}
for (const id of Object.keys(figureDoc?.chapters ?? {})) {
  if (!files.includes(`${id}.json`)) errors.push(`图契约包含不存在的章节 ${id}`);
}

console.log(`图契约：${Object.keys(figureDoc?.chapters ?? {}).length} 章；缺图警告 ${missingFigures.length} 段`);
for (const item of missingFigures) console.log(`  ⚠ 缺图 ${item}`);

console.log(`检查 ${files.length} 个章节 / 原始 runId ${runs.size} 个 / 优先级技能 ${skillKeys.size} 个 / 当前英雄 ${activeHero ?? '未标注'}`);
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
