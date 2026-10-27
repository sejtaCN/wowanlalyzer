# 工作流程（从数据到页面）

> 这份文档回答一件事：**从零到一篇能上线的章节，要经过哪些步骤、每步的命令和产出是什么。**
> 新增专精、补新章节、改数值，都走同一条流水线。

---

## 0. 全景

```
①数据源          ②跑批              ③分析            ④内容稿        ⑤门禁        ⑥页面
profile/APL  →  sims / A-B / adds  →  联动·杠杆·构成  →  章节 JSON  →  校验  →  三屏渲染
日志 CSV     →  阶段推断           →  阶段表          →  （同上）    →  同上   →  高手对照
路线 JSON    →  波次归一化         →  逐波建议        →  L2 页        →  同上   →  地图 + 表
```

三个原则贯穿全程：

1. **数字必须有出处**：页面上每个百分比都要能追到 runId 或日志事件。
2. **数据先于文案**：先跑出数，再写结论；写不出数的结论不写。
3. **每步都可重跑**：所有产出都是脚本生成的文件，不手改。

---

## 1. 数据源（一次准备，长期复用）

| 材料 | 放哪 | 怎么来 | 备注 |
| --- | --- | --- | --- |
| SimC 本体 | `.tools/simc/simc.exe` | GitHub `simc-publish` 制品 | 1210-01 / WoW 12.1.5 |
| 专精 profile（含 APL） | `content/profiles/MID2_shadow_archon.simc` | SimC nightly 导出 | 每英雄天赋一份 |
| 优先级表 | `content/guides/priority-table.json` | `npm run guide:apl` | 从 APL 生成，含条件人话 |
| 中文技能名 | `content/guides/skills.json` | 手工核对 + NGA 对照 | `verified` 分两档 |
| 日志 | `content/logs/*.json` | WCL 事件表 CSV 导入 | 整场，无战斗分段 |
| 路线 | `content/routes/*.json` | keystone.guru 抓取 | 波次构成与顺序 |
| 专精注册表 | `content/specs.json` | 手工 | `active` 才有内容 |

---

## 2. 跑批（三种产物）

### 2.1 基础模拟：每个波次模型的 DPS

```bash
npm run sims:run -- --iters 5000      # 英雄天赋 × 场景
npm run sims:summary                  # 汇总成前端读的 numeric-summary.json
```

产出 `content/sims/*__5000.json`，每个文件带 SimC 版本、commit、迭代数、95% CI。

### 2.2 决策 A/B：改一行条件，看价值

```bash
npm run sims:ab -- --decision aoe --values 1,2,3,4,5,6
npm run sims:ab -- --decision burst --scenarios waves --values 1,0
```

产出 `content/sims/dec_*.json`，文件里记录 `edit.before/after`（改了哪一行）。

### 2.3 配装：属性 / 附魔 / 消耗品 / 饰品的贡献

```bash
npm run gearing -- --iters 3000        # 4 个输出模型 × 11 个变体
```

产出 `content/sims/gear_*.json`（每次跑批一个 runId）+ `content/analysis/gearing-archon.json`。

- 次级属性走 SimC `calculate_scale_factors`（每 1 点 rating 换多少 DPS），折算成「每 700 点涨百分之几」（约一颗宝石当量）。
- 附魔 / 武器油 / 饰品走 A/B：从 profile 里摘掉那一样再跑。饰品是「属性 + 特效」整体贡献，不是纯特效。
- **阳性对照**：整把主手武器拿掉必须掉一大截（实测 −20%）；不掉就说明仪器没在测东西，脚本会把 `passed:false` 写进 JSON，页面据此警告。
- 附魔只看**武器**（用户口径）；头/肩/胸/腿/戒指附魔不进分析。美化按 crafted 装备上的 `bonus_id` 摘除。
- 套装用 `set_bonus=midnight_season_2_4pc=0` / `..._2pc=0` 关掉再跑（实测有效），据此量出 2/4 件套各自价值。

### 2.3b 属性最优化：曲线 + 预算内最优配比

```bash
npm run statopt -- --iters 2000      # 4 模型 × （4 属性 × 4 档曲线 + 最优校核）
```

产出 `content/sims/stato_*.json` + `content/analysis/stat-opt-archon.json`。

- 曲线：把总预算（现装备四项评级之和，实测 **3209**）**全压到一个属性**上（25/50/75/100%），其余置 0，每个点真跑一次；SimC 的开关是 `gear_<stat>_rating=<绝对值>`（命令行 `haste_rating=` 无效，实测）。
- 优化：曲线分段线性插值，四属性在单纯形上 5% 网格穷举，预测值按**乘区模型**计算（`DPS ≈ DPS(全零) × Π 曲线(i)/DPS(全零)`；可加模型低估 8.5%，已弃用）。
- 校核：最优解用 `gear_<stat>_rating` 同时设四项真跑一遍，预测误差逐模型写进 JSON（不是藏起来的假设）。

### 2.4 加怪窗口：ADD 型

```bash
npm run sims:adds -- --iters 3000
```

产出 `content/sims/dec_voidform_on_*__win*.json` + `content/analysis/adds.json`。

> **已知限制**：本构建的 `raid_events+=/adds` 不生效（三种写法都试过），
> 所以加怪窗口用「N 只怪同时存在 ≈ N+1 目标打同样时长」近似，页面和证据条都写了这条限制。

### 2.5 动作预算：GCD / 狂乱采样

```bash
npm run sims:trace                  # 5 个场景的动作序列 + DPS（seed 固定，可复现）
npm run analysis:budget             # 汇总成动作预算数据
npm run analysis:cooldown           # 两波间隔 / 观测冷却窗口
```

产出 `content/sims/trace_archon__*__5000.json` + `content/analysis/play-budget-archon.json` + `content/analysis/cooldown-window-archon.json`。

- 动作序列是**一次代表迭代**，DPS 是全部 5000 次；页面必须两句话分开写。
- GCD 起手点按不同起始时间去重，药水/饰品/能量灌注与别的动作同刻，不重复计数。
- 狂乱是动作采样，只能读净变化与峰值；`samplesAtCap=0` 不代表没有溢出。
- 两波间隔取 300s 动作序列里相邻虚空形态起点的**观测**间隔，日志 155.7s 只是爆发节奏，不是具体两波间隔。

---

## 3. 分析（三种视图的数据来源）

```bash
npm run analysis:interactions   # 联动图：APL 依赖 + 日志占比
npm run analysis:leverage       # 杠杆：逐技能禁用跑批（30 个技能 × 2 场景）
npm run analysis:share          # 伤害构成：一次基线的 per-spell 拆分
npm run phases                  # 阶段推断：日志 → 9 段阶段表
npm run gearing                 # 配装：属性 / 附魔 / 消耗品 / 饰品（见 §2.3）
npm run analysis:budget         # 动作预算：GCD 起手点 / 动作角色 / 狂乱采样
npm run analysis:cooldown       # 两波间隔：观测冷却 / 大波小波收益 / 日志节奏
```

产出全部落在 `content/analysis/` 与 `content/logs/*-phases.json`。

**判读纪律**：

- 伤害占比 ≠ 重要性（光晕占 1.5%，禁掉掉 13.5%）
- 统计显著 ≠ 实战关键（−0.23% 也超误差带，但可忽略）
- 阶段 ≠ 波次（日志没有死亡事件，切不出单波）

---

## 4. 内容稿（章节 JSON）

结构固定五段，字段见 `packages/learning-core/src/content.ts`：

```
model（波次模型卡）→ chart（主图）→ priorityDiff（技能调整）
→ map（地图）→ casePanel（高手对照）→ evidence（证据）
```

写作规范见 `docs/writing-style.md`：**先动作、后数字、给边界**；术语首次出现给大白话。

同一章还要在图契约 `content/figures/chapters.json` 登记五段各自是 `ready` / `missing` / `not-applicable`、来源与下一批。缺图不再靠段壳里塞一句文字过关。

可以用五种主图：

| chart.kind | 用在哪 | 数据 |
| --- | --- | --- |
| `burst-bars` | 爆发价值对比 | 成对的 runId（`_on_0__` / `_on_1__`） |
| `priority-table` | 优先级表 | `priority-table.json` |
| `skill-cards` | 技能清单 | 同上 |
| `log-stats` | 日志统计 | `content/logs/*.json` |
| `wave-table` | 副本逐波建议 | `content/routes/*.json` + 模拟档位 |

第①段另有 `play-budget`（动作预算）：数据来自 `play-budget-archon.json`，根元素必须带 `data-figure-kind="play-budget"`，门禁检查 `.pb-bar` 与资源 SVG 都存在。

L1-05 第①段用 `cooldown-window`（两波间隔）：数据来自 `cooldown-window-archon.json`，根元素带 `data-figure-kind="cooldown-window"`，门禁检查 `.cw-track`。L0-01/02 第⑤段用 `cast-chart`（整场施法），被动触发单独列。

L2 第③段不是独立数据：按当前选波的目标数映射到 L1-01/02/03/04 的 `priorityDiff`，页面必须写「规则映射，不是这一波专属数据」；`check:ui` 断言切波后 `.pm-row` 文本变化。

---

## 5. 门禁（不过不放行）

```bash
npm run validate:content   # 数字必须有来源；runId 必须存在且带版本/迭代/CI；五段图契约齐全
npx tsc -p tsconfig.json   # 类型
npx vitest run             # 4 条测试（含"学习主线只依赖 learning-core"的导入图测试）
npm run check:ui           # 先构建，再逐章查 11 章；图契约标 ready 的段必须有真图，缺图逐条警告
npm run verify:gates       # 门禁自检：图契约坏样本与 UI 坏样本都必须变红
npm run build              # 单文件产出
```

`validate:content` 会拦下这些东西：

- 引用了不存在的 runId 或日志 id
- 正文出现百分比但 evidence 里既没有 runId 也没有日志
- L1/L2 页缺模型卡、缺结论句
- 技能名在优先级表里对不上（中文名/新技能会给出警告）
- 图契约不是五段、图类型不在白名单、`ready` 没来源、`missing` 没写下一批

缺图本身不报错，逐条列警告；`check:ui` 另行检查 `ready` 段真的有对应 DOM 图元。

---

## 6. 页面（三屏 + 解析台）

| 屏 | 文件 | 读什么 |
| --- | --- | --- |
| 首页 | `views/Home.tsx` | 下一章、章节分组、教练建议、数据状态 |
| 章节页 | `views/ChapterView.tsx` + `components/ChapterSections.tsx` | 章节 JSON，五段固定 |
| 解析台 | `views/Analyzer.tsx` + `components/Analysis.tsx` | 联动 / 杠杆 / 伤害构成 / runId 清单 |
| 空态 | `views/ComingSoon.tsx` | 专精注册表（未实装专精显示骨架） |

多专精：顶栏选择器 → `state/spec.tsx` → `chaptersFor(specId)` / `allRuns(specId)`。

---

## 7. 新增一个专精的完整步骤

1. `content/specs.json` 加一条：`{ id, className, name, status: 'planned', heroTrees }`
2. 放 profile 到 `content/profiles/`，跑 `npm run guide:apl`
3. 跑 `npm run sims:run` + `npm run sims:summary` + `npm run sims:ab` + `npm run sims:trace` + `npm run analysis:budget` + `npm run analysis:cooldown`
4. 跑 `npm run analysis:leverage` / `analysis:share` / `analysis:interactions`
5. 照五段结构写 `content/chapters/*.json`（每篇五段、每个数字带 runId）
6. `npm run validate:content` 过门禁
7. `content/specs.json` 里把 `status` 改成 `active`
8. 打开页面确认：首页分组、章节页五段、解析台六段

不改任何组件代码。

---

## 8. 一次内容更新的最小清单

```bash
npm run sims:run && npm run sims:summary      # 数据更新了吗
npm run analysis:leverage                     # 杠杆变了吗
npm run phases                                # 阶段表更新了吗
npm run validate:content                      # 数字都有来源吗
npx vitest run && npm run build               # 门禁通过吗
```

---

## 9. 已知限制（写在这里，免得后面的人重踩）

| 限制 | 影响 | 现状 |
| --- | --- | --- |
| `raid_events+=/adds` 不生效 | 加怪只能近似 | 已在页面标注近似方法 |
| 日志无战斗分段、无死亡事件 | 切不出单波 | 只到阶段级（9 段） |
| WCL 网页 / API | 需 Battle.net 绑定，CN 不可用 | 走事件表 CSV |
| Wowhead | CloudFront 403 | 只取到总览页 |
| NGA | `read.php` 直连 403 | 本地浏览器可读 |
| 目标数 > 8 | 模拟上限 | 一律按 8 只计，页面注明 |
