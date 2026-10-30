import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(join(ROOT, 'content', 'logs', 'wcl-archon-sources.json'), 'utf8'),
);
const strategy = JSON.parse(
  readFileSync(join(ROOT, 'content', 'strategy', 'archon-dungeons.json'), 'utf8'),
);

describe('WCL 8 本清单', () => {
  it('覆盖唯一 8 本并同步打法汇总', () => {
    expect(manifest.dungeons).toHaveLength(8);
    expect(new Set(manifest.dungeons.map((dungeon: any) => dungeon.slug)).size).toBe(8);
    expect(new Set(manifest.dungeons.map((dungeon: any) => dungeon.wclEncounterId)).size).toBe(8);
    expect(strategy.dungeons).toHaveLength(8);
    expect(strategy.dungeons.map((dungeon: any) => dungeon.slug).sort()).toEqual(
      manifest.dungeons.map((dungeon: any) => dungeon.slug).sort(),
    );
  });

  it('ready 项必须有 Pull 级事件、阶段数据与报告元数据', () => {
    for (const dungeon of manifest.dungeons.filter((item: any) => item.wclStatus === 'ready')) {
      expect(dungeon.wcl.reportCode, dungeon.slug).toBeTruthy();
      expect(dungeon.wcl.fightId, dungeon.slug).toEqual(expect.any(Number));
      expect(dungeon.wcl.player, dungeon.slug).toBeTruthy();
      expect(existsSync(join(ROOT, dungeon.dataset.events)), dungeon.slug).toBe(true);
      expect(existsSync(join(ROOT, dungeon.dataset.phases)), dungeon.slug).toBe(true);
      expect(dungeon.pulls.length, dungeon.slug).toBeGreaterThan(0);
    }
  });
});
