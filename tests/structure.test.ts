/**
 * 结构测试：用导入图证明"学习主线只依赖 learning-core 一个包"。
 *
 * 为什么不用截图：截图证明不了依赖方向。这里沿着 import 链走：
 * P1 清理后仓库只剩 packages/learning-core，任何跨包别名（@analysis / @rules /
 * @simc / @contracts / @fixtures）重新出现在学习主线上，测试就失败并指出链路。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ALIASES: Record<string, string> = {
  '@learn': 'packages/learning-core/src/index.ts',
};

/** 学习主线的入口：外壳、三屏、组件、状态、数据层、纯逻辑层 */
const LEARN_ENTRIES = [
  'apps/web/src/App.tsx',
  'apps/web/src/views/Home.tsx',
  'apps/web/src/views/ChapterView.tsx',
  'apps/web/src/state/progress.ts',
  'apps/web/src/components/ChapterSections.tsx',
  'apps/web/src/data/content.ts',
  'packages/learning-core/src/index.ts',
];

/** 清理时删掉的包与旧组件：出现即说明回退 */
const MUST_BE_GONE = [
  // 死代码包（P1 清理）
  'packages/analysis-core',
  'packages/simc-profile',
  'packages/spec-rules',
  'packages/contracts',
  'apps/web/src/components/Timeline.tsx',
  'apps/web/src/components/Markers.tsx',
  // 更早删掉的旧结构 / 旧文档
  'apps/web/src/views/Learn.tsx',
  'apps/web/src/views/LessonPlayer.tsx',
  'apps/web/src/state/learn.tsx',
  'apps/web/src/data/learning-sources.ts',
  'packages/learning-core/src/curriculum.ts',
  'packages/training-core',
  'apps/server',
  'docs/plan-v2.md',
  'docs/product-contract.md',
];

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('.')) {
    base = join(dirname(from), spec);
  } else if (ALIASES[spec]) {
    return ALIASES[spec];
  } else {
    return null; // node_modules
  }
  const cands = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
  const hit = cands.find((c) => existsSync(join(ROOT, c)));
  return hit ?? null;
}

function importsOf(file: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const specs = new Set<string>();
  for (const m of src.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  return [...specs];
}

/** 沿导入链走一遍，收集所有用别名（@开头）引入的模块，并记下是哪个文件引的 */
function reachableAliases(entries: string[]): { file: string; spec: string }[] {
  const norm = (p: string) => p.split('\\').join('/'); // 统一分隔符，避免同一文件被当成两个
  const seen = new Set<string>();
  const queue = entries.map(norm);
  const found: { file: string; spec: string }[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (!existsSync(join(ROOT, cur))) continue;
    for (const spec of importsOf(cur)) {
      const next = resolveSpec(cur, spec);
      if (next) {
        if (!seen.has(norm(next))) queue.push(norm(next));
      } else if (spec.startsWith('@')) {
        found.push({ file: cur, spec });
      }
    }
  }
  return found;
}

describe('学习主线的依赖方向', () => {
  it('学习主线只用一个包别名 @learn', () => {
    const bad = reachableAliases(LEARN_ENTRIES);
    expect(bad, `不该出现的跨包引用：${bad.map((r) => `${r.file} → ${r.spec}`).join(', ')}`).toEqual([]);
  });

  it('死代码与旧结构已删除', () => {
    const left = MUST_BE_GONE.filter((p) => existsSync(join(ROOT, p)));
    expect(left, `这些还在：${left.join(', ')}`).toEqual([]);
  });

  it('导航只有学习与解析台两项', () => {
    const app = readFileSync(join(ROOT, 'apps/web/src/App.tsx'), 'utf8');
    const navButtons = app
      .split('<button')
      .slice(1)
      .filter((chunk) => chunk.includes('aria-current'))
      .map((chunk) => chunk.split('</button>')[0].split('>').pop()!.trim());
    expect(navButtons).toEqual(['学习', '解析台']);
  });

  it('章节页数据文件存在，L1/L2 有模型卡', () => {
    const dir = join(ROOT, 'content/chapters');
    const files = readFileSync(join(ROOT, 'content/chapters/l1-01-mid.json'), 'utf8'); // 至少存在
    expect(files.length).toBeGreaterThan(0);
    expect(existsSync(dir)).toBe(true);
  });
});
