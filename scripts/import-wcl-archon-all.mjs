/**
 * 批量归一化清单里所有 ready 的 Archon 副本。
 *
 * 每本副本先按 docs/WCL-ARCHON-PIPELINE.md 准备 rawSnapshot，并把
 * wclStatus 改为 ready；本命令随后一次生成全部 events / phases。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'content', 'logs', 'wcl-archon-sources.json'), 'utf8'));
const ready = manifest.dungeons.filter((dungeon) => dungeon.wclStatus === 'ready');
const failures = [];

for (const dungeon of ready) {
  console.log(`\n[${dungeon.name}]`);
  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts', 'import-wcl-event-pages.mjs'), `--dungeon=${dungeon.slug}`],
    { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' },
  );
  if (result.status !== 0) failures.push(dungeon.slug);
}

console.log(`\n批量归一化：${ready.length - failures.length}/${ready.length} 成功`);
if (failures.length) {
  console.error(`失败：${failures.join(', ')}`);
  process.exit(1);
}
