# 更新指南（接手就用这份）

> 面向"隔一段时间回来继续做"的场景：先看 §1 现状，再按 §3 找对应任务的步骤。
> 详细原理见 `docs/workflow.md`；写正文查 `docs/guide-content-rules.md`（文案与内容结构的唯一规范源）；
> 改样式查 `docs/design-rules.md`（间距阶 / 颜色 token / 中文排版 / 无障碍底线）。

---

## 1. 现状（2026-10-27）

| 项 | 数量 | 位置 |
| --- | --- | --- |
| 实装专精 | 1（暗影牧师，执政官 / 虚空编织者） | `content/specs.json` |
| 占位专精 | 1（恶魔猎手·噬灭·歼灭者） | 同上，`status: planned` |
| 章节 | 11（L0×4 / L1×6 / L2×1） | `content/chapters/` |
| 教练建议 | 7 条 | `content/coaching/general.json` |
| 模拟 runId | 246 个有效 | `content/sims/` + 汇总 `numeric-summary.json` |
| 图契约 | 11 章 × 5 段；48 有图 / 2 缺图 / 5 不适用 | `content/figures/chapters.json` |
| 分析数据 | 联动 / 杠杆 / 伤害构成 / 加怪窗口 / 动作预算 / 两波冷却 / 阶段表 / 配装 / 属性最优化 | `content/analysis/`、`content/logs/` |
| 代码量 | 约 4,050 行 TS/TSX | `apps/web`、`packages/learning-core` |
| 前端数据层 | `content.ts` / `specs.ts` 已入库；由 JSON 真源建立运行时索引 | `apps/web/src/data/` |

技术底座：Vite + React 18 + TypeScript；SimC 1210-01（WoW 12.1.5）在 `.tools/simc/`（不进 git）。

---

## 2. 目录地图

```
content/
  specs.json            专精注册表（active 才有内容）
  profiles/*.simc       SimC profile（含 APL）—— 一切数值的源头
  guides/priority-table.json   APL → 人话优先级表（38 条）
  guides/skills.json          技能中文名（verified 分两档）
  glossary.json               术语表（页面上悬停解释）
  chapters/*.json             章节内容（五段结构）
  figures/chapters.json       五段图契约：ready / missing / not-applicable + 来源
  coaching/general.json       教练建议
  sims/*.json                每次模拟一条记录（runId + 版本 + CI）
  sims/numeric-summary.json  前端只读这一张汇总
  analysis/*.json            联动 / 杠杆 / 伤害构成 / 加怪 / 配装 / 属性最优化
  logs/*.json                日志导入结果 + 阶段推断
  routes/*.json              keystone 路线（波次构成）

scripts/                 数据生产线（全部可重跑）
docs/                    产品 / UI / 教学 / 流程 / 规范
  guide-content-rules.md  **文案与内容结构规范源**：四类内容表达规范 / 写作流程 / AI 味清单
  design-rules.md         **设计规范适配层**：间距阶 / 颜色 token / 中文排版 / 无障碍底线
  nga-copy-spec.md        NGA 风格改写的施工记录 + 已落盘正文快照
  ui-blueprint.md        **UI 设计源**：模块划分 / 参考模板 / 设计语言 / 逐页详细设计
  ui-refresh-plan.md     文案与可读性优化方案（改写对照表 + 排版设定 + 验收）
apps/web/src/            三屏 + 解析台
  components/Teaching/   教学图组件（顶图带 / 波次图 / 爆发时间轴 / 判断流程 / 灰模库）
packages/learning-core/  内容模型 + 进度（纯逻辑）
```

---

## 3. 四种常见更新，怎么做

### 3.1 只改数值（版本更新、新装备）

```bash
# 1) 换 profile（新赛季的 APL）
cp <新 profile> content/profiles/MID2_shadow_archon.simc

# 2) 重跑全部模拟
npm run sims:run && npm run sims:summary
npm run analysis:leverage && npm run analysis:share && npm run analysis:interactions
npm run gearing && npm run statopt   # 配装与属性最优化（换版本才需要重跑）
npm run sims:adds
npm run sims:trace && npm run analysis:budget && npm run analysis:cooldown

# 3) 过门禁
npm run validate:content && npm test && npm run build
```

章节 JSON 不用改——它们引用的是 runId，数值会自己更新。**唯一的例外**：正文里写死的数字（如"−48.04%"）需要跟着改，改完要跑 `validate:content` 确认来源还在。

### 3.2 加一章（新波次模型 / 新主题）

1. 复制一份现有 JSON（推荐 `l1-03-small.json` 作模板）
2. 改 `id / level / order / title / subtitle / claim`
3. 五段必须齐全：`model → chart → priorityDiff → map → casePanel → evidence`
4. `chart.runIds` 里填真实存在的 runId（`grep` 一下 `content/sims/`）
5. 在 `apps/web/src/data/content.ts` 的 `ALL_CHAPTERS` 里注册
6. `npm run validate:content`

### 3.3 加一个副本（L2）

```bash
# 抓路线（keystone 可直接 curl 瓦片；路线页面用浏览器读）
node <抓取脚本或手工存 content/routes/>
# 归一化波次 → waves-<副本>.json（参考 waves-altar-of-fangs.json）
# 写章节：chart.kind = "wave-table"，map 指向该副本
```

写完把 `ALTAR_WAVES` 换成按副本读取（现在 `data/content.ts` 里只写死了一张图）。

### 3.4 加一个专精

见 `docs/workflow.md` §7，八步；界面不用改。

---

## 4. 门禁（不许跳过）

```bash
npm run validate:content   # 数字来源 + 结构完整性 + 55 段图契约
npx tsc -p tsconfig.json   # 类型
npx vitest run             # 9 条，含依赖方向与数据层回归
npm run check:doc:selftest  # 文档解析器 LF / CRLF 自测
npm run check:doc          # 文档 §4 与章节 JSON 逐字一致
npm run check:ui           # 先构建，再逐章查 11 章；图契约标 ready 的段必须有真图
npm run verify:gates       # 门禁自检：正样本绿、坏样本红
npm run build              # 单文件产出
```

`validate:content` 会拦：不存在的 runId / 没来源的百分比 / 缺模型卡 / 缺结论 / 技能名对不上 / 未知图类型。
缺图不是错误，会逐条列出并标下一批；`check:ui` 同时检查图的 DOM 是否真的存在。
`check:ui` 会自动寻找 Chrome、Edge 或 Chromium；也可用 `CHROME_PATH` 指定浏览器。

---

## 5. 待办（按优先级）

### P0 · 影响正确性

| # | 待办 | 为什么 | 入口 |
| --- | --- | --- | --- |
| 1 | **英雄天赋切换**（执政官 / 虚空编织者） | 杠杆和优先级表本来就是分天赋跑的，现在只展示执政官；切换后同一套界面能看两份结论 | `content/profiles/*archon*`、`*voidweaver*`；UI 加一个 hero-tree 选择器（复用 spec 选择器的模式） |
| 2 | **正文硬编码数字与 runId 脱钩** | 现在 claim 里的数字是手写，换版本后要人工核对；爆发增量已改为从 runId 计算，claim 仍待处理 | 续做 `claimTemplate` + 占位符（`{{delta}}`），渲染时从 runId 取 |

### P1 · 内容缺口

| # | 待办 | 说明 |
| --- | --- | --- |
| 3 | 图契约中 2 段缺图 | 当前 55 段里有 48 段有真图；剩余 L0-03 与 L1-01 第⑤段都是阶段图，缺 Fights/UNIT_DIED，不能硬切单波；归 E | `content/figures/chapters.json` |
| 4 | 第二个副本的 L2 页 | 需要路线数据 + 波次归一化；`data/content.ts` 里 `ALTAR_WAVES` 要改成按副本读取 |
| 5 | 高手对照做到单波级 | 需要带 `Fights` 或 `UNIT_DIED` 的导出；现在的 9 段是阶段级 |
| 6 | ADD 型改用真加怪模型 | 当前是"窗口近似"；要么换支持 `raid_events` 的 SimC 构建，要么用 `DungeonSlice` |

### P2 · 体验

| # | 待办 | 说明 |
| --- | --- | --- |
| 6 | 章节页进度条 | 顶栏显示 L0/L1/L2 各读了几篇（`progress.seen` 已有数据） |
| 7 | 解析台加"相邻两行交换" A/B | 比"禁用技能"更贴近优先级本身 |
| 8 | 联动图补"谁挂上了 DoT"的边 | 需要重导完整 DoT 条带（现在只有 600 条样本） |
| 9 | 教练卡按"你哪条没做到"高亮 | 依赖日志分段 |
| 10 | **读者可见文案中文化 + 排版 6 档字号** | 全局已落地 `36/24/18/16/14/12`、400/500 两档字重、16px 正文、32px 段距与 36em 行长；6 个 L1 与 L2 已统一目录、决策顶图带、证据折叠与阶段结构，L0 仍保留基础章节结构 | `docs/ui-reference-decomposition.md`、`docs/ui-blueprint.md` §3–§4 |
| 11 | **UI 设计文档（已出稿）** | 已有 `docs/ui-blueprint.md`：功能模块盘点、10 个真实参考站来源、设计语言、逐页详细设计、响应式断点、验收门禁 | 同上；§0 有 7 条待确认（Q1 评论/账号是否本轮新建、Q2 亮色主题、Q3 粘性目录侧栏） |

### P3 · 上线与合规（暂不进入主线）

| # | 待办 | 说明 |
| --- | --- | --- |
| 12 | **补 `LICENSE`** | 参考同类开源项目的许可文件作为模板；同时确认代码授权、第三方数据/地图来源和魔兽世界非官方声明。正式公开前完成，当前不阻塞主线。 |
| 13 | **静态部署预演** | 用 Cloudflare Pages / Netlify / Vercel 之一部署只读版本；构建命令 `npm ci && npm run build`，产物目录 `dist`。先使用平台临时域名，不购买或绑定域名。 |
| 14 | **`.io` 域名与在线产品化** | 预演通过后再处理自定义域名、章节 URL/分享链接、SEO 元数据、SPA 回退和自动部署门禁；账号、收藏、评论等动态能力另立后端议题。 |

---

## 6. 已知限制（别重复踩）

| 限制 | 影响 | 已知解法 |
| --- | --- | --- |
| `raid_events+=/adds` 不生效 | 加怪只能近似 | 用「N+1 目标 × 同时长」窗口 |
| 日志无战斗分段 / 无死亡事件 | 切不出单波 | 只到阶段级（9 段） |
| 动作序列只有一次代表迭代 | 动作数 / 狂乱曲线不是 5000 次平均 | 页面分开写；DPS 仍用全部迭代的均值与 CI |
| `dec_*` 的 hero 来源 | 旧文件曾用 Voidweaver 底稿、文档按 Archon 引用 | 已全部用 Archon 重跑并写入 `hero/profileId/profileFile`；读 run 前先看这三个字段 |
| WCL 网页 / API | 需 Battle.net，CN 不可用 | 走事件表 CSV |
| Wowhead | CloudFront 403 | 只取到总览页 |
| NGA `read.php` | 直连 403 | 本地浏览器可读 |
| 目标数 > 8 | 模拟上限 | 一律按 8 计，页面注明 |
| `num_executes` 是按目标数分桶的字典 | 直接取会得到 null | 求和后再用 |

---

## 7. 三条红线

1. **没有 runId 的百分比不许进页面**——宁可写"待补"，也不编。
2. **切不出来的东西就说切不出来**——日志没分段就不写"他第 7 波怎么打"。
3. **有来源 ≠ 已核对**——中文技能名分 `verified` 两档，界面上会同时显示英文键名。

---

## 8. 一句话记住流程

```
换 profile → 跑批 → 跑分析 → 写章节 JSON → 过门禁 → 页面自动更新
```

页面上所有数字都来自 runId；所有结论都来自跑批；所有文案都按 `writing-style.md` 写。
