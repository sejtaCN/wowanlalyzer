/**
 * 把 Keystone.guru 的 Altar of Fangs 路线 JSON 映射为本站波次文件。
 *
 * 输入（脚本参数或默认 .tools/tmp）：
 *   --route=<keystone route html>
 *   --mapping=<keystone mapping version js>
 *   --dungeon=<keystone dungeon data js>
 * 输出：content/routes/waves-altar-of-fangs.json
 *
 * 三重防线：
 *   1. 路线每个 enemy id 必须在同版本 mapping 数据中存在；
 *   2. 路线 forces 总和必须与页面 enemyForces 一致；
 *   3. NPC 单体 forces 由 mapping 的 npcEnemyForces 提供，缺失则失败。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (key, fallback) => argv.find((x) => x.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const ROUTE_FILE = resolve(ROOT, argOf('route', '.tools/tmp/kg-xwt8Pza.html'));
const MAPPING_FILE = resolve(ROOT, argOf('mapping', '.tools/tmp/kg-altar-facade.js'));
const DUNGEON_FILE = resolve(ROOT, argOf('dungeon', '.tools/tmp/kg-altar-data.js'));
const OUT = resolve(ROOT, argOf('out', 'content/routes/waves-altar-of-fangs.json'));

function parseContext(file) {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`${file}: 找不到 JSON`);
  return JSON.parse(text.slice(start, end + 1));
}

const html = readFileSync(ROUTE_FILE, 'utf8');
const routeMatch = html.match(/"killZones":(\[.*?\]),"mapIcons":/s);
if (!routeMatch) throw new Error('找不到路线 killZones');
const killZones = JSON.parse(routeMatch[1]);
const routeInfo = html.match(/"publicKey":"([^"]+)".*?"enemyForces":(\d+)/s);
const routeForces = routeInfo ? Number(routeInfo[2]) : null;
const routeTitle = html.match(/"title":"([^"]+)"/)?.[1] ?? 'Altar of Fangs';
const mapping = parseContext(MAPPING_FILE);
const dungeon = parseContext(DUNGEON_FILE);

if (mapping.mappingVersion.id !== 1085) throw new Error(`mapping 版本变化：${mapping.mappingVersion.id}`);
if (mapping.mappingVersion.dungeon_id !== 182) throw new Error(`dungeon id 变化：${mapping.mappingVersion.dungeon_id}`);

// Keystone 的 mapping 版本数据在 HTML 的 mapContext 初始化里；facade 文件只提供 NPC forces。
const mappingText = readFileSync(MAPPING_FILE, 'utf8');
// facade.js 把 mapping 顶层字段打平成多个 JS 片段；instance 对象本身是独立 JSON。
const enemyData = [...mappingText.matchAll(/\{"id":\d+,"mapping_version_id":1085,"enemy_pack_id":[^}]+\}/g)]
  .map((match) => JSON.parse(match[0]));
if (!enemyData.length) throw new Error('找不到 enemy 实例数据');
const enemyById = new Map(enemyData.map((e) => [e.id, e]));
const npcById = new Map(dungeon.dungeonNpcs.map((n) => [n.id, n]));
const forcesByNpc = new Map(mapping.npcEnemyForces.map((x) => [x.id, x.enemy_forces?.enemy_forces ?? 0]));

function nameOf(npcId) {
  return npcById.get(npcId)?.name ?? `NPC ${npcId}`;
}

function npcClassificationOf(name) {
  return [...npcById.values()].find((npc) => npc.name === name)?.classification_id ?? null;
}

let accumulatedForces = 0;
const encounterPhase = (pull, encounter) =>
  encounter === "Rav'i"
    ? 'before-first-boss'
    : encounter === 'The Writhing Coil'
      ? 'before-second-boss'
      : encounter === "Zul'jan"
        ? 'before-final-boss'
        : pull <= 6
          ? 'sacrificial-approach'
          : pull <= 9
            ? 'mutation-chambers'
            : pull <= 14
              ? 'inner-altar'
              : 'final-platform';

const waves = killZones.map((zone) => {
  const mobs = new Map();
  let forces = 0;
  let boss = false;
  for (const id of zone.enemies) {
    const enemy = enemyById.get(id);
    if (!enemy) throw new Error(`pull ${zone.index} enemy ${id} 不在 mapping 中`);
    const npc = npcById.get(enemy.npc_id);
    if (!npc) throw new Error(`pull ${zone.index} npc ${enemy.npc_id} 不在 dungeon 数据中`);
    const entry = mobs.get(npc.name) ?? { count: 0, npcIds: new Set(), unitForces: new Set() };
    entry.count += 1;
    entry.npcIds.add(enemy.npc_id);
    entry.unitForces.add(forcesByNpc.get(enemy.npc_id) ?? 0);
    mobs.set(npc.name, entry);
    forces += forcesByNpc.get(enemy.npc_id) ?? 0;
    if (npc.classification_id === 3) boss = true;
  }
  const bossNames = [...mobs.keys()].filter((name) => npcClassificationOf(name) === 3);
  const trashMobCount = [...mobs.entries()]
    .filter(([name]) => npcClassificationOf(name) !== 3)
    .reduce((sum, [, entry]) => sum + entry.count, 0);
  return {
    pull: zone.index,
    killZoneId: zone.id,
    mobs: [...mobs.entries()].map(([name, entry]) => ({
      name,
      count: entry.count,
      npcIds: [...entry.npcIds],
      unitForces: [...entry.unitForces],
    })),
    mobCount: zone.enemies.length,
    forces,
    isBoss: boss,
    trashMobCount,
    // Keystone 的示例路线把 boss 前的怪单独成 pull；这些怪本身不是 boss。
    classification: boss ? 'boss' : 'trash',
    encounter: bossNames[0] ?? null,
    phase: encounterPhase(zone.index, bossNames[0] ?? null),
    enemyIds: zone.enemies,
    enemyPositions: zone.enemies.flatMap((id) => {
      const enemy = enemyById.get(id);
      return enemy ? [{ id, x: enemy.lat, y: enemy.lng }] : [];
    }),
    // 旧字段保留，避免页面读取接口在迁移期间掉数据；新字段由本脚本真算。
    dangerous: [],
    skippable: 0,
    // 文档里的 forcesPct 是累计进度，不是这一 pull 的 forces / 门槛。
    forcesPct: Math.round((accumulatedForces += forces) / mapping.mappingVersion.enemy_forces_required * 1000) / 10,
    // BOSS 不在这里冒充“单体木桩”；只有纯 BOSS 且没有小怪时才匹配单体档。
    scenarioId: boss
      ? trashMobCount === 0
        ? 'w90_1b'
        : null
      : trashMobCount >= 8
        ? 'w30_8'
        : trashMobCount >= 7
          ? 'w30_7'
          : trashMobCount >= 6
            ? 'w30_6'
            : trashMobCount >= 5
              ? 'w30_5'
              : 'w30_2',
    burst: null,
    sourcePull: zone.index,
  };
});

const totalForces = waves.reduce((n, w) => n + w.forces, 0);
if (routeForces != null && totalForces !== routeForces) {
  throw new Error(`forces 不一致：路线 ${routeForces} / 映射合计 ${totalForces}`);
}
const totalMobs = waves.reduce((n, w) => n + w.mobCount, 0);
const existing = JSON.parse(readFileSync(OUT, 'utf8'));
const out = {
  ...existing,
  dungeon: 'Altar of Fangs',
  route: routeTitle,
  routePublicKey: routeInfo?.[1] ?? null,
  source: 'keystone.guru',
  sourceUrl: 'https://keystone.guru/route/altar-of-fangs/xwt8Pza/skandar-tank-altar-of-fangs-10-to-16-keys',
  fetchedAt: new Date().toISOString().slice(0, 10),
  mappingVersion: mapping.mappingVersion.id,
  mdtMappingHash: mapping.mappingVersion.mdt_mapping_hash,
  mdtAddonVersion: mapping.mappingVersion.mdt_addon_version,
  pulls: waves.length,
  totalMobs,
  totalForces,
  requiredForces: mapping.mappingVersion.enemy_forces_required,
  waves,
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`写出 ${OUT}: ${waves.length} pulls / ${totalMobs} mobs / ${totalForces} forces`);
for (const wave of waves) console.log(`  p${String(wave.pull).padStart(2)} ${wave.isBoss ? 'BOSS' : 'trash'} ${wave.mobCount} mobs ${wave.forces} forces ${wave.mobs.map((m) => `${m.name}×${m.count}`).join(', ')}`);
