/**
 * 8 本大秘境 WCL 覆盖状态。
 *
 * 默认是报告模式；加 --strict 时，只有 8 本都达到 Pull 级才通过。
 * 用法：
 *   node scripts/check-wcl-archon.mjs
 *   node scripts/check-wcl-archon.mjs --strict
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'content', 'logs', 'wcl-archon-sources.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const strategyPath = join(ROOT, 'content', 'strategy', 'archon-dungeons.json');
const strict = process.argv.includes('--strict');
const errors = [];

const expected = new Set([
  'altar_of_fangs',
  'den_of_nalorakk',
  "kings_rest",
  'murder_row',
  'ruby_life_pools',
  'temple_of_sethraliss',
  'the_blinding_vale',
  'voidscar_arena',
]);

if (manifest.dungeons?.length !== expected.size) {
  errors.push(`副本清单应为 ${expected.size} 本，实际 ${manifest.dungeons?.length ?? 0} 本`);
}
const slugs = new Set();
const encounterIds = new Set();
for (const dungeon of manifest.dungeons ?? []) {
  const where = dungeon.slug || '(未命名副本)';
  if (!expected.has(dungeon.slug)) errors.push(`${where}: 不在当前赛季 8 本名单`);
  if (slugs.has(dungeon.slug)) errors.push(`${where}: slug 重复`);
  if (encounterIds.has(dungeon.wclEncounterId)) errors.push(`${where}: WCL encounterId 重复`);
  slugs.add(dungeon.slug);
  encounterIds.add(dungeon.wclEncounterId);
  if (!['ready', 'phase-only', 'pending'].includes(dungeon.wclStatus)) {
    errors.push(`${where}: wclStatus 非法（${dungeon.wclStatus}）`);
  }
}
for (const slug of expected) if (!slugs.has(slug)) errors.push(`缺少副本 ${slug}`);

const readJson = (rel) => {
  if (!rel) return null;
  const path = resolve(ROOT, rel);
  if (!existsSync(path)) {
    errors.push(`文件不存在：${rel}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    errors.push(`JSON 解析失败：${rel}`);
    return null;
  }
};

const strategy = readJson('content/strategy/archon-dungeons.json');
if (!strategy) errors.push(`缺少打法汇总：${strategyPath}`);
if (strategy) {
  const strategySlugs = new Set((strategy.dungeons ?? []).map((dungeon) => dungeon.slug));
  for (const slug of expected) if (!strategySlugs.has(slug)) errors.push(`打法汇总缺少副本 ${slug}`);
  if ((strategy.dungeons ?? []).length !== expected.size) {
    errors.push(`打法汇总应为 ${expected.size} 本，实际 ${strategy.dungeons?.length ?? 0} 本`);
  }
}

const rows = [];
for (const dungeon of manifest.dungeons ?? []) {
  const events = readJson(dungeon.dataset?.events);
  const phases = readJson(dungeon.dataset?.phases);
  const strategyRow = strategy?.dungeons?.find((item) => item.slug === dungeon.slug);
  if (dungeon.wclStatus === 'ready') {
    if (!dungeon.wcl?.reportCode) errors.push(`${dungeon.slug}: ready 但缺 reportCode`);
    if (!Number.isInteger(dungeon.wcl?.fightId)) errors.push(`${dungeon.slug}: ready 但缺 fightId`);
    if (!dungeon.wcl?.player) errors.push(`${dungeon.slug}: ready 但缺 player`);
    if (!events?.segments?.length) errors.push(`${dungeon.slug}: ready 但缺 Pull 事件`);
    if (!phases?.phases?.length) errors.push(`${dungeon.slug}: ready 但缺阶段数据`);
    if (events?.segments?.length && phases?.phases?.length && events.segments.length !== phases.phases.length) {
      errors.push(`${dungeon.slug}: 事件 Pull ${events.segments.length} 个，阶段 ${phases.phases.length} 个`);
    }
    if (events && phases && phases.sourceLog !== events.runId) {
      errors.push(`${dungeon.slug}: phases.sourceLog 未指向 events.runId`);
    }
    const pullCount = dungeon.pulls?.length ?? 0;
    if (phases?.method?.summary && !phases.method.summary.includes(`${pullCount} 个真实战斗分段`)) {
      errors.push(`${dungeon.slug}: 方法说明未使用实际 Pull 数 ${pullCount}`);
    }
    if (phases?.limitation && !phases.limitation.includes(`+${dungeon.wcl.keyLevel}`)) {
      errors.push(`${dungeon.slug}: 限制说明未使用实际 Key +${dungeon.wcl.keyLevel}`);
    }
    if (phases?.limitation && !phases.limitation.includes(`${pullCount} 个真实战斗分段`)) {
      errors.push(`${dungeon.slug}: 限制说明未使用实际 Pull 数 ${pullCount}`);
    }
    if (strategyRow?.sourceLog !== phases?.runId) {
      errors.push(`${dungeon.slug}: 打法汇总的 sourceLog 未指向 phases.runId`);
    }
    const expectedCounts = dungeon.dataset?.expected;
    if (expectedCounts && events && phases) {
      if (events.pages != null && events.pages !== expectedCounts.pages) {
        errors.push(`${dungeon.slug}: 页数应为 ${expectedCounts.pages}，实际 ${events.pages}`);
      }
      if (events.rawEvents != null && events.rawEvents !== expectedCounts.events) {
        errors.push(`${dungeon.slug}: 事件数应为 ${expectedCounts.events}，实际 ${events.rawEvents}`);
      }
      if (events.segments.length !== expectedCounts.pulls) {
        errors.push(`${dungeon.slug}: Pull 数应为 ${expectedCounts.pulls}，实际 ${events.segments.length}`);
      }
      const bursts = phases.phases.reduce((sum, phase) => sum + phase.bursts, 0);
      if (bursts !== expectedCounts.bursts) {
        errors.push(`${dungeon.slug}: 爆发数应为 ${expectedCounts.bursts}，实际 ${bursts}`);
      }
      const dotBands = events.segments.reduce((sum, segment) => sum + (segment.dotBands ?? 0), 0);
      if (dotBands < expectedCounts.dotBands) {
        errors.push(`${dungeon.slug}: DoT 分段只有 ${dotBands}，少于预期 ${expectedCounts.dotBands}`);
      }
    }
  } else if (dungeon.wclStatus === 'phase-only') {
    if (!phases?.phases?.length) errors.push(`${dungeon.slug}: phase-only 但缺阶段数据`);
  }
  rows.push({
    dungeon: dungeon.name,
    encounterId: dungeon.wclEncounterId,
    status: dungeon.wclStatus,
    report: dungeon.wcl?.reportCode ?? '—',
    pulls: events?.segments?.length ?? phases?.phases?.length ?? 0,
    route: dungeon.route?.status ?? 'pending',
    strategy: strategyRow?.status ?? 'missing',
  });
}

console.log('副本'.padEnd(24) + 'WCL'.padEnd(13) + '报告'.padEnd(8) + 'Pulls'.padEnd(8) + '路线'.padEnd(10) + '打法');
console.log('─'.repeat(79));
for (const row of rows) {
  console.log(
    row.dungeon.padEnd(24) +
    row.status.padEnd(13) +
    (row.report === '—' ? '—' : '有').padEnd(8) +
    String(row.pulls).padEnd(8) +
    row.route.padEnd(10) +
    row.strategy,
  );
}
const ready = rows.filter((row) => row.status === 'ready').length;
const phaseOnly = rows.filter((row) => row.status === 'phase-only').length;
const pending = rows.filter((row) => row.status === 'pending').length;
const finalized = rows.filter((row) => row.strategy === 'final').length;
console.log(`\n总计：ready ${ready} · phase-only ${phaseOnly} · pending ${pending} · 打法定稿 ${finalized}`);

if (errors.length) {
  console.error(`\n清单错误 ${errors.length} 条：`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}
if (strict && (ready !== expected.size || finalized !== expected.size)) {
  console.error(
    `\n未达到最终版：Pull 级 ${ready}/${expected.size}，打法定稿 ${finalized}/${expected.size}`,
  );
  process.exit(1);
}
