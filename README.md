# 专精学习系统（暗影牧师 · 已实装）

看图学输出：**这一波怎么打、爆发给哪一波**。
数字全部来自本机 SimC 跑批与真实日志，页面上每个百分比都能追到 runId。

---

## 怎么打开（三种方式，任选）

### ① 双击（最省事）

| 文件 | 作用 |
| --- | --- |
| **`打开系统.bat`** | 用默认浏览器打开已打包好的界面（不需要 Node、不需要装东西） |
| **`开发模式.bat`** | 起本地开发服务器 `http://127.0.0.1:5273`，改代码即时生效 |
| **`打开文档.bat`** | 打开 `docs/` 文件夹 |

### ② 直接双击 HTML

```
D:\wowanlalyzer\dist\index.html
```

单文件构建，CSS/JS 全部内联，双击就能用；地图在 `dist/maps/`。

### ③ 命令行

```bash
cd /d D:\wowanlalyzer
npm run dev      # 开发模式 http://127.0.0.1:5273
npm run build    # 重新打包到 dist/index.html
```

---

## 界面上有什么

```
顶栏：专精选择器（暗牧 / 噬灭） · 学习 | 解析台

学习首页
├── hero：下一步该看哪一章
├── 章节分组：L0 基础(4) / L1 波次模型(6) / L2 副本实战(1)
├── 教练建议：7 条，带数字证据
└── 数据状态条

章节页（顶图带 + 五段，每段：编号+一句话 → 图 → 一句说明）
顶图带：这一波长什么样 · 一条数字结论 · 该做什么
① 这一波几只  ② 开爆发值多少  ③ 技能怎么改  ④ 落在哪一波  ⑤ 真人怎么打

解析台（纵向六段，与章节页同一语言）
① 谁依赖谁  ② 少它会掉多少  ③ 伤害从哪来
④ 换个输出模型这件东西还值多少（配装）⑤ 攻略是谁说的、我们验了什么（参考资料）⑥ 原始结果在哪
```

---

## 文件入口

| 想改什么 | 去哪 |
| --- | --- |
| 章节文字 / 数字 | `content/chapters/*.json` |
| 教练建议 | `content/coaching/general.json` |
| 术语解释 | `content/glossary.json` |
| 技能中文名 | `content/guides/skills.json` |
| 专精列表（含未实装的） | `content/specs.json` |
| SimC 配置（一切数值的源头） | `content/profiles/*.simc` |
| 页面 / 组件 | `apps/web/src/` |
| 教学图（顶图带/波次图/时间轴/判断流程） | `apps/web/src/components/Teaching/` |
| 数据生产线 | `scripts/` |
| 文档 | `docs/` |

---

## 常用命令

```bash
npm run dev                # 开发服务器
npm run build              # 打包（产出 dist/index.html）
npm test                   # 4 条结构测试
npm run validate:content   # 关卡：没有来源的数字不许进页面
npm run check:ui           # 关卡：先构建，再逐章查 11 章五段 / 图契约 / 字号 / 栅格 / 无 JS 错误
npm run verify:gates       # 关卡自检：正样本应绿、坏样本应红

# 数据生产线（一般只在换版本时跑）
npm run sims:run           # 全场景模拟
npm run sims:summary       # 汇总给前端读
npm run sims:trace         # 动作序列留档（GCD / 狂乱）
npm run analysis:budget    # 压成 L1 动作预算图数据
npm run analysis:cooldown  # 两波间隔 / 冷却窗口
npm run sims:ab            # 决策 A/B
npm run sims:adds          # 加怪窗口
npm run analysis:leverage  # 逐技能禁用（杠杆）
npm run analysis:share     # 伤害构成
npm run analysis:interactions  # 联动关系
npm run gearing            # 配装：武器附魔 / 武器油 / 美化 / 饰品 / 套装 × 4 个输出模型
npm run statopt            # 属性最优化：收益曲线 + 预算内最优配比（4 个模型各一套）
npm run phases             # 日志 → 阶段表
```

---

## 文档

新手先看这两份：

- **[更新指南 docs/HANDOVER.md](docs/HANDOVER.md)** — 现状、四种常见更新怎么做、待办清单
- **[工作流程 docs/workflow.md](docs/workflow.md)** — 数据 → 跑批 → 分析 → 内容 → 门禁 → 页面

其余：

| 文档 | 内容 |
| --- | --- |
| [writing-style.md](docs/writing-style.md) | 页面写作规范（参照 NGA / Wowhead） |
| [product.md](docs/product.md) | 产品定义、教学主线、数据红线 |
| [ui-design.md](docs/ui-design.md) | 界面规范（四档字号、720 栅格、五段结构、多专精架构） |
| [curriculum.md](docs/curriculum.md) | 章节结构与进度表 |
| [methods.md](docs/methods.md) | 方法说明：联动/杠杆 · 日志阶段推断 · 教程交叉核对 · 配装与属性优化 |
| [figure-contract.md](docs/figure-contract.md) | 图契约：五段图清单、缺图状态、11 章 UI 门禁与坏样本自检 |
| [first-principles.md](docs/first-principles.md) | 第一性原理：其他教程做什么、我们缺什么、下一步补什么 |

---

## 当前状态

- 专精：暗影牧师（执政官 / 虚空编织者）已实装；噬灭（歼灭者）占位，切过去看到骨架预览
- 章节 11 篇：L0×4、L1×6、L2×1
- 数据：246 个 runId（含配装 36 + 属性优化 80 + 动作 trace 5）、9 段真实日志阶段、1 条副本路线（祭牙祭坛）、4 个输出模型
- 门禁：`validate:content` 通过（55 段图契约：48 有图 / 2 缺图 / 5 不适用） · `check:ui` 逐章检查 11 章 + 窄屏 · `verify:gates` 4/4（含坏样本） · `vitest` 4/4 · `tsc` 通过 · 单文件构建约 682KB

## 三条红线

1. 没有 runId 的百分比不许进页面——宁可写"待补"
2. 切不出来的东西就说切不出来（日志没分段，就不写"他第 7 波怎么打"）
3. 有来源 ≠ 已核对（中文技能名分 `verified` 两档）
