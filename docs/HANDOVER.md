# 更新指南（接手就用这份）

> 面向"隔一段时间回来继续做"的场景：先看 §1 现状，再按 §3 找对应任务的步骤。
> 详细原理见 `docs/workflow.md`；写正文查 `docs/guide-content-rules.md`（文案与内容结构的唯一规范源）；
> 改样式查 `docs/design-rules.md`（间距阶 / 颜色 token / 中文排版 / 无障碍底线）。

---

## 1. 现状（2026-10-30）

| 项 | 数量 | 位置 |
| --- | --- | --- |
| 实装范围 | 暗影牧师 · 仅执政官（Archon）；虚空编织者待补 | `content/specs.json` |
| 占位专精 | 1（恶魔猎手·噬灭·歼灭者） | 同上，`status: planned` |
| 章节 | 12（L0×4 / L1×6 / L2×2：毒牙祭坛 / 红玉新生池） | `content/chapters/` |
| 教练建议 | 7 条 | `content/coaching/general.json` |
| 模拟 runId | 原始 296 个；前端只查明确归属 Archon 的 235 条 | `content/sims/` + 汇总 `numeric-summary.json` |
| 日志样本 | 小花生阶段级 9 段；8 本大秘境 Archon 暗牧 WCL 单样本共 329 页、97,599 条筛选事件、81 个有效 Pull、100 个虚空形态窗口、12,147 个 DoT 区间，打法均为 `sample-reviewed` | `content/logs/`、`content/strategy/` |
| 图契约 | 12 章 × 5 段；55 有图 / 0 缺图 / 5 不适用；红玉第⑤段使用 WCL 8 个真实战斗分段；L0-03 / L1-01 第五段为模拟时间线；L0-03 第②段是「表 + 两张核对图」同屏（契约 kind 仍为 priority-table） | `content/figures/chapters.json` |
| 分析数据 | 联动 / 杠杆 / 伤害构成 / 加怪窗口 / 动作预算 / 两波冷却 / 阶段表 / 配装 / 属性最优化 / 相邻交换；红玉样本 1,536 个 DoT 区间 | `content/analysis/`、`content/logs/` |
| 代码量 | 约 5,709 行 TS/TSX | `apps/web`、`packages/learning-core` |
| 前端数据层 | `content.ts` / `specs.ts` 已入库；由 JSON 真源建立运行时索引 | `apps/web/src/data/` |
| 单文件产物 | 1,112,982 字节（含红玉事件、L0-03 右栏与分析数据） | `dist/index.html`，内联 CSS/JS；Vite 报的 kB 数是字符计量，不是文件字节 | `dist/` |

技术底座：Vite + React 18 + TypeScript；SimC 1210-01（WoW 12.1.5）在 `.tools/simc/`（不进 git）。

---

## 2. 目录地图

```
content/
  specs.json            专精注册表（active 才有内容）
  profiles/*.simc       SimC profile（含 APL）—— 一切数值的源头
  guides/priority-table.json   APL → 人话优先级表（38 条；10 条本构建用不上，行内带原因）
  guides/skills.json          技能中文名（verified 分两档）
  guides/condition-human.json 优先级表 38 行的人工「人话条件」（生成时合并进 priority-table.json）
  glossary.json               术语表（页面上悬停解释）
  chapters/*.json             章节内容（五段结构）
  figures/chapters.json       五段图契约：ready / missing / not-applicable + 来源
  coaching/general.json       教练建议
  sims/*.json                每次模拟一条记录（runId + 版本 + CI）
  sims/numeric-summary.json  前端只读这一张汇总
  analysis/*.json            联动 / 杠杆 / 伤害构成 / 加怪 / 配装 / 属性最优化
  logs/*.json                日志导入结果 + 阶段推断
  routes/*.json              keystone 路线（波次构成；一条路线一个文件）
  maps/*.webp                地牢地形图（瓦片拼接产物，入库；构建时复制到 dist/maps）

scripts/                 数据生产线（全部可重跑）
  import-wcl-event-pages.mjs  公开 WCL 标题筛选事件 → 真实 Pull 分段
docs/                    产品 / UI / 教学 / 流程 / 规范
  guide-content-rules.md  **文案与内容结构规范源**：四类内容表达规范 / 写作流程 / AI 味清单
  design-rules.md         **设计规范适配层**：间距阶 / 颜色 token / 中文排版 / 无障碍底线
  nga-copy-spec.md        NGA 风格改写的施工记录 + 已落盘正文快照
  ui-blueprint.md        **UI 设计源**：模块划分 / 参考模板 / 设计语言 / 逐页详细设计
  ui-refresh-plan.md     文案与可读性优化方案（改写对照表 + 排版设定 + 验收）
  research/              外部数据核对记录（route-data-pipeline.md：路线采集链路与复现步骤）
  WCL-ARCHON-PIPELINE.md 8 本副本的 WCL 提取、归一化与打法定稿流程
apps/web/src/            三屏 + 解析台
  components/Teaching/   教学图组件（顶图带 / 目标刻度 / 波次图 / 动作预算 / 冷却窗口 / 爆发时间轴 / 模拟时间线 / 灰模库）
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

章节 JSON 不用改——它们引用的是 runId，数值会自己更新。**唯一的例外**：正文里写死的中文数字（claim 与说明句里的增益、差值）需要跟着改，改完要跑 `validate:content` 确认来源还在。

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

```bash
# 抓三个上游输入（版本号写在资产路径里，改版会 404）
curl -sL -o .tools/tmp/kg-<key>.html "https://keystone.guru/route/<slug>/<publicKey>/<title>/<keylevel>"
curl -s  -o .tools/tmp/kg-<slug>-facade.js "https://assets.keystone.guru/compiled/v16.2.2/mapcontext/data/<slug>/<mappingVersion>/facade.js"
curl -s  -o .tools/tmp/kg-<slug>-data.js   "https://assets.keystone.guru/compiled/v16.2.2/mapcontext/data/<slug>/en_US.js"

# 注册表加一条（slug / mappingVersionId / dungeonId / sourceUrl / phase），再导入
node scripts/import-route.mjs --dungeon=<slug> --out=content/routes/waves-<slug>.json
```

地形图：从路线页挑出该副本的 `tiles_webp/<expansion>/<dungeonKey>/<floor>/<zoom>/<x>_<y>.webp`，4×4 张 384×256 拼成 1536×1024，存 `content/maps/<slug 用连字符>.webp`（入库）；`npm run build` 会把它复制到 `dist/maps`。

写完收口这两步（`chapterRoute` 已按副本读取）：

1. `content/routes/waves-<slug>.json`：文件名里的 `<slug>` 必须与章节 `map.dungeon` 一致（如 `altar_of_fangs`）。
2. `apps/web/src/data/content.ts` 的 `ROUTE_DOCS` 加一行 `slug: wavesJson as unknown as RouteDoc`。

地图底图按同一 slug 放 `dist/maps/<slug 用连字符>.webp`（如 `altar-of-fangs.webp`），没有底图时该段会显示「待补」，不会用别的地牢的图顶。L2 章节的路线只认自己副本：`routeFor(slug)` 找不到就返回 `null`，不使用 L1 的示例路线。

### 3.4 加一个专精

见 `docs/workflow.md` §7，八步；界面不用改。

---

## 4. 门禁（不许跳过）

```bash
npm run validate:content   # 数字来源 + 结构完整性 + 60 段图契约
npm run typecheck          # 类型
npx vitest run             # 30 条，含结构、数据层、相邻交换、分析门禁与 WCL 8 本清单
npm run check:copy         # 可见文案：禁用词 / 术语 / AI 腔 / 长度预算 / 依据可追
npm run check:design       # 间距阶 / 颜色 token / 中文排版 / 无障碍
npm run check:doc:selftest  # 文档解析器 LF / CRLF 自测
npm run check:doc          # 文档 §4 与章节 JSON 逐字一致
npm run check:analysis     # 配装阳性对照 / 属性复现差 / 最优预测误差
npm run check:adjacent     # 相邻两行交换的差值、误差与判定按 runId 重算
npm run check:ui           # 先构建，再逐章查 12 章；图契约标 ready 的段必须有真图
npm run check:static       # 本地起 HTTP 加载 dist：验证放到静态托管也能跑（底图走相对路径）
npm run audit:text         # 报告型：逐页抓读者可见文字里的工程口径泄漏（「」框住的不算）
                           # 记录编号按数据计，不计入问题数
npm run verify:gates       # 门禁自检 26 项：正样本绿、坏样本红
npm run build              # 单文件产出
```

`validate:content` 会拦：不存在的 runId / 没来源的百分比 / 缺模型卡 / 缺结论 / 技能名对不上 / 未知图类型。
缺图不是错误，会逐条列出并标下一批；`check:ui` 同时检查图的 DOM 是否真的存在。
`check:ui` 会自动寻找 Chrome、Edge 或 Chromium；也可用 `CHROME_PATH` 指定浏览器。

---

## 5. 待办（按优先级）

> 现状：**仍有 1 个专精范围、1 个毒牙单波日志、1 个个人日志导入与部署事项未完成**；红玉日志、DoT 边、主层地图标注和教练卡样本自检已收口。
> 每条只写「为什么 / 入口 / 依赖」，做完改成 ~~删除线~~ 并补一句实测口径，不要另开第二份待办文档。

### P0 · 影响正确性

| # | 待办 | 为什么 | 入口 / 依赖 |
| --- | --- | --- | --- |
| 1 | **虚空编织者数据待补** | 当前决定只做执政官。Voidweaver 只有 7 个基础模拟，缺杠杆、伤害构成、配装、属性优化、章节和独立优先级；补齐前不展示，也不回退 Archon 数据 | `content/profiles/*voidweaver*`；按 Archon 同一数据契约整套重跑（**被数据卡住**） |
| 2 | ~~正文硬编码数字与 runId 脱钩~~ 已解决 | claim 改模板，`claimFields` 挂 runId（`pair` / `runId` / `of`），渲染在 `apps/web/src/data/claim.ts`；顺带纠正「41%」应为 **40%** | `content/chapters/l1-04-boss.json`；门禁 4 道 + `verify:gates` 坏样本 |

### P1 · 内容缺口

| # | 待办 | 说明 | 依赖 |
| --- | --- | --- | --- |
| 3 | ~~图契约缺图~~ 已补齐 | L0-03 / L1-01 第⑤段改用模拟动作时间线；当前 60 段 = 55 有图 / 0 缺图 / 5 不适用 | — |
| 4 | ~~第二个副本的 L2 页~~ 已上线 | 红玉新生池：12 波 / 76 只 / 554 forces，路线 `Xnxx3lT`，地形图已拼 | — |
| 5 | ~~红玉第⑤段（真人对照）~~ 已完成 | 使用 WCL 公共报告 `j9YnMJVfBzgHwvcD` 的 `Dukkie` +21 执政官暗牧；8 个真实 Pull、12 个虚空形态窗口、10,722 条筛选事件 | `dukkie-ruby-life-pools-events/phases` |
| 6 | 8 本高手样本人工复核 | 8 本均已到 WCL Pull 级数据；玩法结论仍是 `sample-reviewed`，需逐条复核证据后才能改为 `final` | **待人工定稿** |
| 7 | ~~BOSS 带小怪的真加怪模型~~ 按近似方案落地 | p10 / p15 按全场目标数近似并显式标注；`raid_events+=/adds` 被静默忽略 | 若要精确 → **等支持 raid_events 的 SimC 构建** |

### P2 · 体验（本地网页，能立即动手）

| # | 待办 | 说明 | 依赖 |
| --- | --- | --- | --- |
| 8 | ~~章节页进度~~ 已上线 | 顶栏显示 `L0 x/4 · L1 x/6 · L2 x/2`，`check:ui` 断言数值与章节表一致；900px 以下隐藏 | — |
| 9 | ~~相邻两行交换 A/B 上图~~ 已上到 L0-03 右栏 | 4 组结论 + 无效对照说明；入口只有 L0-03 第②段 | — |
| 10 | ~~优先级表「条件」列人工补人话~~ 已上线 | 38 行口语版写在 `content/guides/condition-human.json`，生成时合并成 `conditionHuman`；页面读人话，`validate:content` 查「缺行 / 混进 APL 原文 / 超过 150 字」，`verify:gates` 有坏样本 | — |
| 10b | ~~解析台读者化~~ 已上线 | 技能名缺中文时加「」、段名/表头改「模拟记录」、`跑批`改「模拟」、配装方法里的 SimC 命令加「」；`audit:text` 现为 0 处（记录编号按数据计） | — |
| 11 | ~~红玉地形图只有一层~~ 已拍板 | 保留主层，并明确标注「仅主层，不表示完整楼层路径」；现有波次数据没有逐波楼层归属 | `waves-ruby-life-pools.json#mapScope` |
| 12 | ~~联动图补「谁挂上了 DoT」的边~~ 已补齐 | 红玉样本含 1,536 个完整 DoT 区间；`analyze-interactions` 已切换到该日志 | `content/analysis/interactions.json` |
| 13 | ~~教练卡样本自检~~ 已上线 | 用同一份 8 段日志标出「已做到 / 需检查」；这是公开样本，不是个人日志 | `content/coaching/dukkie-sample-audit.json` |
| 13b | 个人日志上传后的角色级高亮 | 仍需用户导入自己的分段日志，再把规则结果映射到个人角色 | **等个人日志导入功能** |

### P3 · 上线与合规

| # | 待办 | 说明 | 依赖 |
| --- | --- | --- | --- |
| 14 | ~~补 `LICENSE`~~ 已完成 | 代码 MIT / 内容 CC BY-NC 4.0 / 第三方与暴雪非官方声明；GitHub 已识别为 MIT | — |
| 15 | **静态部署预演** | 本地预演已过（`npm run check:static`：0 失败请求 / 12 章 / 底图正常）；三平台步骤在 `docs/DEPLOY.md` | **等你授权平台账号**（Cloudflare Pages / Netlify / Vercel） |
| 16 | `.io` 域名与在线产品化 | 自定义域名、章节 URL/分享、SEO、自动部署门禁；账号/收藏/评论另立后端议题 | 依赖 15 |

### 等你拍板（三选一即可，不拍也能继续跑）

1. ~~优先级表条件列~~：已选人工补人话并上线。
2. ~~红玉地形图~~：已选主层 + 明确标注。
3. **部署**：已暂缓；保留双击与本地 HTTP 两种打开方式。

## 6. 已知限制（别重复踩）

| 限制 | 影响 | 已知解法 |
| --- | --- | --- |
| `raid_events+=/adds` 不生效 | 加怪只能近似 | 用「N+1 目标 × 同时长」窗口 |
| 小花生日志无战斗分段 / 无死亡事件 | 该份日志切不出单波 | 只到阶段级（9 段）；红玉另有 WCL Pull 级样本 |
| 动作序列只有一次代表迭代 | 动作数 / 狂乱曲线不是 5000 次平均 | 页面分开写；DPS 仍用全部迭代的均值与 CI |
| `dec_*` 的 hero 来源 | 旧文件曾用 Voidweaver 底稿、文档按 Archon 引用 | 已全部用 Archon 重跑并写入 `hero/profileId/profileFile`；读 run 前先看这三个字段 |
| WCL API / 网页 | v2 API 需注册客户端凭据；公开报告页可能弹真人验证 | 公开报告页 + 默认事件视图逐页取数；本地样本已留 URL、报告代码和筛选表达式 |
| Wowhead | CloudFront 403 | 只取到总览页 |
| NGA `read.php` | 直连 403 | 本地浏览器可读 |
| 目标数 > 8 | 模拟上限 | 一律按 8 计，页面注明 |
| `num_executes` 是按目标数分桶的字典 | 直接取会得到 null | 求和后再用 |
| 地形图是瓦片拼的，不随构建生成 | 换副本要自己抓瓦片拼接（步骤见 `docs/research/route-data-pipeline.md`）；漏了就只有文字、没有底图 |
| `talentsHash` 在 2026-10-29 之前的 296 条记录里只有 12 位 | 那是天赋串前缀（`CIQAAAAAAAAA`），两套构建同值，**不能**用来判定构建一致 | 生产者已改成整串 sha256 取 16 位（只对之后的新 run 有效）；旧记录按 `profileFile` + `hero` 认构建 |

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
