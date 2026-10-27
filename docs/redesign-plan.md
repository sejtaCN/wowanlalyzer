# 清理与改版方案（图解教程方向）

> 用途：开新对话时把这份丢进去，按批次执行。
> 盘点日期：2026-10-26；盘点方式：import 图 + 引用计数 + 文件体积（数字都是实测）。
> §1–§2 是 P1 当时的历史诊断，部分问题已在本轮解决；当前状态以 §4 批次表和 `docs/figure-contract.md` 为准。

---

## 1. 诊断：为什么现在"割裂"

不是审美问题，是**五个结构性问题**叠在一起：

| # | 症状 | 证据（文件） | 后果 |
| --- | --- | --- | --- |
| 1 | 模板段数固定，但**图有 5 种形态** | `chapter.chart.kind` 有 `burst-bars` / `priority-table` / `skill-cards` / `log-stats` / `wave-table` 五种，每种渲染成不同样子 | 每一章翻过去都像换了个站 |
| 2 | 首页与章节页**是两种视觉语气** | 首页是 hero + 教练卡（大留白、14px）；章节页是六连卡（密、12px） | 从首页进章节，像进了另一个产品 |
| 3 | 解析台是**工具语气** | `Analyzer.tsx` tab + 密集表格，与教程叙事无关 | 学习到一半点解析台，叙事断了 |
| 4 | **没有教学图**，全是数据图 | 11 篇章节里 0 张示意图：没有怪群分布、没有时间轴、没有判断流程 | 读者只能读数字，不能"看图理解" |
| 5 | 术语是**隐式**的 | `Gloss.tsx` 用虚线下划线，无图标无提示 | 读者不知道可以悬停 |

对照：反而是**未实装专精那页**最像教程（流水线图 + 三个灰模 + 一句说明），因为它的图是手写死的组件，**没有复用**。这就是"噬灭页看着更完整、暗牧页却割裂"的真实原因。

---

## 2. 旧方案残留（实测清单）

### A. 死代码 —— 3,088 行，零引用

| 项 | 行数 | 体积 | 为什么死 |
| --- | ---: | ---: | --- |
| `packages/analysis-core` | 1,386 | 58KB | 只被 `Timeline.tsx` 用，而 Timeline 已无引用 |
| `apps/web/src/components/Timeline.tsx` | 1,016 | 44KB | 解析台已重写，没有页面 import 它 |
| `packages/simc-profile` | 465 | 17KB | 旧"导入个人配置"功能，产品已删 |
| `packages/spec-rules` | 147 | 6KB | 冰法演示规则，只被 analysis-core 用 |
| `apps/web/src/components/Markers.tsx` | 74 | 3KB | 只被 Timeline 用 |
| `packages/contracts` | 980 | — | **只剩一个 `IsoDateTime` 被 learning-core 引用** |

处理：删前四项；`contracts` 把 `IsoDateTime` 内联进 `learning-core/content.ts` 后整包删除。同时干掉 `tsconfig` / `vite.config` 里的 `@analysis`、`@rules`、`@simc`、`@contracts` 别名。

### B. 陈旧数据 —— 975KB，无页面引用

| 项 | 体积 | 说明 |
| --- | ---: | --- |
| `content/sims/index.json`、`ui-feed.json`、`timeline-feed.json` | 180KB | 旧解析台的数据格式，新前端不读 |
| `content/sims/decision-aoe.json`、`decision-burst.json`、`decisions.json`、`control-vt-ttd.json`、`wave-burst.json`、`burst-by-wave.json` | 88KB | 早期决策分析的聚合文件；单条 runId 已保留 |
| `content/routes/waves-multi.json`、`waves-labeled.json`、`multi-summary.json` | 56KB | 六路线对比的中间产物，结论已写进文档 |
| `content/routes/altar-of-fangs-skandar.json`、`raw/` | 115KB | keystone 原始抓取，归一化后不再需要 |
| `content/logs/xiaohuasheng-coil.json` | 478KB | 旧一次导入（被 `xiaohuasheng-events.json` 取代） |
| `content/logs/demo-csv-shadow-st.json`、`fixture/` | 58KB | 合成夹具，只给已删的 CSV 导入脚本用 |

### C. 缓存与快照 —— 11.7MB（不进库）

`shots/` 5.8MB（旧页面截图）· `_snapshot_before_p0_20261025.zip` 5.8MB · `.tools/tmp/` 12.5MB · `fixtures/` 236KB（旧演示数据）· `data/meta.db` 32KB（旧 SQLite）

处理：`shots/`、快照、`fixtures/`、`data/` 直接删；`.tools/tmp` 加进 `.gitignore` 并清空。

### D. 脚本

| 脚本 | 状态 |
| --- | --- |
| `wcl-fetch.mjs`（API v2 OAuth） | 已删：CN 战网不支持绑定 |
| `wcl-csv-import.mjs`（原始事件 CSV） | 已删：被 `wcl-table-import.mjs` 取代 |
| `wcl-table-import.mjs`、`wcl-events-import.mjs` | 留：日志导入路径 |
| 其余 10 个 | 留 |

### E. 文档

| 文档 | 处理 |
| --- | --- |
| `cleanup.md` | 已删（已被本方案取代） |
| `design-chapter.html` | 已删（早期设计稿，UI 已重做两轮） |
| `analysis-methods.md` + `inference-phases.md` + `guides-crosscheck.md` | 已合并成 `methods.md`（三节：联动与杠杆 / 日志阶段 / 教程交叉核对） |
| `product / ui-design / curriculum / workflow / writing-style / HANDOVER` | 留 |

---

## 3. 界面统一方案（往"图解教程"收）

### 3.1 一条硬规则

> **每一段必须有一张图；没有图的段落降级为"表格 + 一句说明"，不允许纯文字段落。**

这条规则就是噬灭页看起来成立的唯一原因，把它变成模板约束。

### 3.2 统一模板

```
每个章节页 =
  顶图带（三格：这一波长什么样 / 一条数字结论 / 该做什么）
  ↓
  五段，每段固定：段标题（编号 + 一句话） → 图 → 一句说明
```

- 字号收敛成四档：30 / 21 / 14 / 12（现在混用了 19、18、16、13.5、12.5、11.5）
- 首页与章节页共用同一套栅格（内容宽 720，卡片间距 14）
- 解析台从 tab 改成纵向四卡（联动 / 杠杆 / 构成 / runId），与章节页同一语言

### 3.3 三个新图组件（复用，不再一次性手写）

| 组件 | 回答什么 | 数据 | 用在 |
| --- | --- | --- | --- |
| `WaveDiagram` | 这一波是几只怪、聚还是一字排开 | 路线波次（`content/routes`） | L1 全部 + L2 |
| `BurstTimeline` | 爆发窗口和波次的时间关系 | 日志阶段 + 模拟窗口 | L1-05 节奏、L0-04 冷却 |
| `DecisionFlow` | 三步判断：几只 → 多久 → 开不开 | 章节结论 + runId | 每章顶图带 |

噬灭页现在那三个灰模（流水线 / 五段骨架 / 柱状）抽成同一个组件库，空态页也复用它们。

### 3.4 迁移顺序

1. 先立模板与组件（`components/Teaching/*`），不改内容
2. 拿 1 篇（L1-02 大波）做样板，确认视觉后再铺开
3. 其余 10 篇逐篇补图，内容文字不动（已有写作规范）

---

## 4. 执行批次

| 批 | 做什么 | 验收 |
| --- | --- | --- |
| **P1 清理**（半天） | 按 §2 删死代码 / 陈旧数据 / 缓存 / 死脚本；内联 `IsoDateTime`；清别名 | ✅ 已执行（2026-10-26）：`tsc` + `vitest` 4/4 + `validate:content` 全绿；仓库 9.0MB → 1.7MB。**包体不变**：死代码本来就没进 bundle，555KB 是"清前=清后"（原计划"降到 500KB"的假设不成立） |
| **P2 模板**（1 天） | 三个图组件 + 顶图带 + 字号栅格收敛；首页/解析台改造 | ✅ 已执行：`components/Teaching/{TopBand,WaveDiagram,BurstTimeline,DecisionFlow,Skeleton}` + `rules.ts`（阈值只写一处）；字号四档 30/21/14/12、内容宽 720、间距 14；章节页 = 顶图带 + 五段（编号+一句话 → 图 → 一句说明）；解析台 tab → 纵向六段；门禁 `npm run check:ui`（DOM 断言 + 截图） |
| **P3 铺开**（2 天） | 11 篇逐篇补教学图 | ✅ 已完成主体。A 批建立图契约；B 批定首页 / L1-02 / L2-01 样板；C 批补动作预算；D 批补 L0 施法、L1-04 BOSS 路线、L1-05 冷却窗口与非相邻示例、L2 选波→L1 优先级映射。当前 **48 有图 / 2 缺图 / 5 不适用**；剩 2 段阶段图因缺 Fights/UNIT_DIED，保留 E |
| **P2.5 装备与来源**（已执行） | ① 配装：武器附魔 / 武器油 / 美化 / 饰品 / 2 件套 / 4 件套 × 4 输出模型（`gearing`）；② 属性最优化：每属性 4 档实测曲线 + 固定预算（真实评级合计）下的最优配比 + 复现校核与预测误差（`statopt`）；③ 参考资料页（四家原文摘要 + 一致项 + 分歧裁决）；④ 删掉作业题（六段 → 五段） | `tsc` / `vitest` / `validate:content` / `check:ui` / `build` 全绿；配装与优化数据各带 runId |
| **A 真源与门禁**（已执行） | 图契约 + 五段状态、`rules.ts` 改为按 runId 计算增量、11 章逐章 UI 门禁、门禁坏样本自检 | ✅ `validate:content` 通过；`check:ui` 11/11 章通过；`verify:gates` 4/4（正样本绿、坏样本红） |
| **B 三页样板**（已执行） | 首页学习路径图、L1-02 目标刻度 + 优先级位置图、L2 路线总览 → 选波 → 当前波详情；地图段只给地形 | ✅ 首页无完成率、只有一个主按钮；L1/L2 图契约有真图；L2 点波后顶部 / 详情 / 地图注记同步；窄屏无横向溢出 |
| **C 动作预算**（已执行） | 5 个 trace runId（2/4/5/8 目标与 BOSS）、动作角色拆分、GCD 起手点去重、狂乱采样收支；修掉 `dec_*` 用 Voidweaver 底稿却按 Archon 引用的来源漂移 | ✅ 5 章第①段有真图；数据重跑后 claim/rules 同步；`trace` 固定 seed 可复现 |
| **D 收口剩余缺图**（已执行） | L0-01/02 施法次数；L1-04 BOSS 路线示例；L1-05 观测冷却窗口 + 非相邻档位示例；L2 选波 → L1 优先级映射；L0/L1-05/L1-04 顶图带按 BOSS / ADD / 节奏分支 | ✅ 缺图 8→2；L2 第③段随选波切换并有 DOM 断言；余 2 段阶段图仍缺 Fights/UNIT_DIED |
| **P4 噬灭**（可选） | 按 `docs/workflow.md` §7 填内容 | 该专精 `status` 改 `active` 后页面完整 |

---

## 5. 验收标准（可核对）

- [x] `grep -r "@analysis\|@rules\|@simc\|@contracts" apps packages` 无结果
- [x] `content/sims/*.json` 数量 = `numeric-summary.json` 里的 runId 数 + 1（247 = 246 + 1）
- [x] 仓库体积（不含 `.tools`、`node_modules`、`dist`）< 8MB（约 2.18MB）
- [x] 首页 / 章节页 / 解析台三处的字号、卡片圆角、间距来自同一份 CSS 变量（`--fs-1..4` / `--content` / `--gap`）
- [x] `npm run validate:content`：未知 `chart.kind` 失败；五段图契约缺段失败；缺图逐条警告
- [x] `npm run check:ui`：逐章检查 11 章；`ready` 段必须找到真实图元
- [x] `npm run verify:gates`：图契约缺段与 UI 图元被改坏两种坏样本都能让门禁失败
- [ ] 9 段缺图清零；每段有一张能回答该段问题的图，而不是机械补两张

---

## 6. 红线（清理时不许破）

1. 没有 runId 的百分比不许进页面
2. 切不出来的东西就说切不出来
3. 有来源 ≠ 已核对（`verified` 两档不变）
4. 删除＝物理删除，不留 `_old`、不留注释掉的旧代码
