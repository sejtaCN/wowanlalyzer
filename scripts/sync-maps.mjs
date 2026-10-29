/**
 * 把 content/maps/*.webp 同步到 dist/maps/。
 *
 * 为什么要有这一步：地图底图是瓦片拼接产物，单文件构建不会内联它（`<img src="./maps/...">`）。
 * dist/ 不入库，所以底图真源放 content/maps/（入库），构建后复制过去，双击 dist/index.html 才有图。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'content', 'maps');
const OUT = join(ROOT, 'dist', 'maps');

if (!existsSync(SRC)) {
  console.log('content/maps 不存在，跳过底图同步');
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((file) => file.endsWith('.webp'));
for (const file of files) copyFileSync(join(SRC, file), join(OUT, file));
console.log(`底图同步：${files.length} 张 → dist/maps（${files.join(' / ')}）`);
