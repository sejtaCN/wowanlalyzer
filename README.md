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
④ 换个输出模型，这件东西还值多少（配装）⑤ 攻略是谁说的，这里验了什么（参考资料）⑥ 原始结果在哪
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
| 教学图（顶图带/目标刻度/波次图/动作预算/冷却窗口/时间轴） | `apps/web/src/components/Teaching/` |
| 数据生产线 | `scripts/` |
| 文档 | `docs/` |

---

## 常用命令

```bash
npm run dev                # 开发服务器
npm run build              # 打包（产出 dist/index.html）
npm test                   # 26 条测试：结构 / 数据层 / 相邻交换 / 分析门禁
npm run typecheck          # 类型
npm run validate:content   # 关卡：没有来源的数字不许进页面
npm run check:copy         # 关卡：可见文案（禁用词 / 术语 / AI 腔 / 长度预算 / 依据可追）
npm run check:design       # 关卡：间距阶 / 颜色 token / 中文排版 / 无障碍
npm run check:doc:selftest # 文档解析器 LF / CRLF 自测
npm run check:doc          # 文档 §4 与章节 JSON 逐字一致
npm run check:analysis     # 关卡：配装阳性对照 / 属性复现差 / 最优预测误差
npm run check:adjacent     # 关卡：相邻两行交换的差值、误差与判定按 runId 重算
npm run check:ui           # 关卡：先构建，再逐章查 12 章五段 / 图契约 / 字号 / 栅格 / 无 JS 错误
npm run verify:gates       # 关卡自检：23 项正样本应绿、坏样本应红

# 数据生产线（一般只在换版本时跑）
npm run sims:run           # 全场景模拟
npm run sims:summary       # 汇总给前端读
npm run sims:trace         # 动作序列留档（GCD / 狂乱）
npm run analysis:budget    # 压成 L1 动作预算图数据
npm run analysis:cooldown  # 两波间隔 / 冷却窗口
npm run analysis:timelines # 模拟动作时间线（L0-03 / L1-01 第五段）
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
- **[数据处理流程 docs/workflow.md](docs/workflow.md)** — 外部来源引用契约、重跑命令、版本核验与交叉印证登记
- **[工作流程 docs/workflow.md](docs/workflow.md)** — 数据 → 跑批 → 分析 → 内容 → 门禁 → 页面

其余：

| 文档 | 内容 |
| --- | --- |
| [writing-style.md](docs/writing-style.md) | 页面写作规范（参照 NGA / Wowhead） |
| [product.md](docs/product.md) | 产品定义、教学主线、数据红线 |
| [ui-design.md](docs/ui-design.md) | 界面规范（六档字号、桌面栏宽、五段结构、多专精架构） |
| [ui-reference-decomposition.md](docs/ui-reference-decomposition.md) | 参考站拆解、第一性原理、L1-02 视觉重构基线 |
| [curriculum.md](docs/curriculum.md) | 章节结构与进度表 |
| [methods.md](docs/methods.md) | 方法说明：联动/杠杆 · 日志阶段推断 · 教程交叉核对 · 配装与属性优化 |
| [figure-contract.md](docs/figure-contract.md) | 图契约：五段图清单、缺图状态、12 章 UI 门禁与坏样本自检 |
| [first-principles.md](docs/first-principles.md) | 第一性原理：其他教程做什么、我们缺什么、下一步补什么 |

---

## 当前状态

- 专精：暗影牧师当前只开放执政官；虚空编织者设为待办，噬灭（歼灭者）仍是占位预览
- 章节 12 篇：L0×4、L1×6、L2×2（毒牙祭坛 / 红玉新生池）
- 数据：原始归档 296 个 runId；站点只查询已明确归属执政官的记录 235 条（含配装 36 + 属性优化 80 + 动作 trace 7）、9 段真实日志阶段、1 条副本路线（毒牙祭坛 15 波）、4 个输出模型；L0-03 / L1-01 第五段使用模拟动作时间线，不冒充真人日志阶段
- 门禁：`validate:content` 通过（60 段图契约：54 有图 / 1 缺图 / 5 不适用；缺的是红玉第⑤段，没有真人日志） · `check:doc` 12/12 章一致 · `check:copy` 0 错 / 0 提醒 · `check:design` 0 错 · `check:analysis` 配装与属性对照通过 · `check:adjacent` 4 组相邻交换通过 · `check:ui` 逐章检查 12 章 + Archon-only 解析台 + 属性四模型 DOM 断言 + 桌面宽屏；移动端仅保留冻结冒烟 · `verify:gates` 23/23（含坏样本） · `vitest` 27/27 · `tsc` 通过

## 三条红线

1. 没有 runId 的百分比不许进页面——宁可写"待补"
2. 切不出来的东西就说切不出来（日志没分段，就不写"他第 7 波怎么打"）
3. 有来源 ≠ 已核对（中文技能名分 `verified` 两档）
