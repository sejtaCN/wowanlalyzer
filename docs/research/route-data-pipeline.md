# 路线数据采集链路（keystone.guru → 波次 JSON）

核对日期：2026-10-29

目标：让「这一波有多少只怪、是不是 BOSS」这类外部数据**可复刻**——换副本能重抓，换项目能迁移，加路线能对比。

## 0. 结论

- 链路完整可复现。2026-10-29 从线上重抓三个输入、重跑导入，产出与仓库 `content/routes/waves-altar-of-fangs.json` **逐字一致**，只有 `fetchedAt` 从 `2026-10-28` 变成 `2026-10-29`；2026-10-30 脚本泛化成 `import-route.mjs`（多副本注册表）后重跑，祭牙产物仍逐字一致。
- 已有两条路线：毒牙祭坛 `xwt8Pza`（15 波 / 108 只 / 825 forces，门槛 817）与红玉新生池 `Xnxx3lT`（12 波 / 76 只 / 554 forces，门槛 551）。
- `docs/curriculum.md` §2 的「6 条路线 / 84 波」**无法从仓库复算**。那是当时读 6 条路线得到的统计，但路线 publicKey 与原始抓取都没有落盘（git 历史里 `content/routes/` 只出现过毒牙祭坛一条）。要重算必须重新选路线，结果不会等于 84。
- 两次统计不能混：§2 是「6 条路线的 84 波」，毒牙祭坛单条是「14 个非空 pull」。后者可随时用 `node scripts/route-distribution.mjs` 复核。

## 1. 数据链（五个来源，各管一段）

| # | 来源 | 取什么 | 落到哪个字段 |
| --- | --- | --- | --- |
| 1 | Keystone.guru 路线页 HTML | `killZones`（每个 pull 的 enemy 实例 id 列表）、`enemyForces`、路线标题 | `pulls` / `waves[].enemyIds` / `totalForces` |
| 2 | Keystone mapping `facade.js` | enemy 实例 → `npc_id`、坐标；`npcEnemyForces` | `mobs[].npcIds`、`forces`、`enemyPositions` |
| 3 | Keystone dungeon `en_US.js` | `npc_id` → 名称、`classification_id`、血量 | `mobs[].name`、`isBoss`、`trashMobCount` |
| 4 | MDT `Midnight/AltarOfFangs.lua` | 全本敌人、坐标、通过门槛 817 | 独立实现交叉核验，不进产物 |
| 5 | Raider.IO 跑本页 | 三个 BOSS 的击杀时间 | 阶段顺序旁证，不参与 pull 边界 |

版本必须钉死，否则 id 会错位：

| 项 | 毒牙祭坛 | 红玉新生池 | 写在哪 |
| --- | --- | --- | --- |
| 资产路径版本 | `compiled/v16.2.2` | 同左 | 三个 URL 里 |
| mapping 版本 | `1085` | `1088` | 注册表 `mappingVersionId` + 脚本断言 |
| dungeon id | `182` | `72` | 注册表 `dungeonId` + 脚本断言 |
| 路线 publicKey | `xwt8Pza` | `Xnxx3lT` | `routePublicKey` |
| MDT mapping hash | `a00c75314d73a26f49dda31b77ddc219` | `45061e8ddb3b3b2a623ac7f909fff24e` | `mdtMappingHash` |
| MDT addon 版本 | `6220` | `6220` | `mdtAddonVersion` |
| 通过门槛 | `817` / 本路线 825 forces | `551` / 本路线 554 forces | `requiredForces` / `totalForces` |

## 2. 复现步骤（命令可直接跑）

```bash
# 1) 路线页（必须 -L：会 302 到带 key level 的 URL）
curl -sL -o .tools/tmp/kg-xwt8Pza.html \
  "https://keystone.guru/route/altar-of-fangs/xwt8Pza/skandar-tank-altar-of-fangs-10-to-16-keys"

# 2) mapping（enemy 实例 → npc_id + forces）
curl -s -o .tools/tmp/kg-altar-facade.js \
  "https://assets.keystone.guru/compiled/v16.2.2/mapcontext/data/altar-of-fangs/1085/facade.js"

# 3) dungeon 数据（npc_id → 名称 / 分类）
curl -s -o .tools/tmp/kg-altar-data.js \
  "https://assets.keystone.guru/compiled/v16.2.2/mapcontext/data/altar-of-fangs/en_US.js"

# 4) 导入（--dungeon 选注册表里的副本；输出文件已存在则合并，不存在则新建）
cp content/routes/waves-altar-of-fangs.json .tools/tmp/repro-waves.json
node scripts/import-route.mjs --dungeon=altar-of-fangs --out=.tools/tmp/repro-waves.json

# 5) 与仓库文件比对（去掉 fetchedAt）
```

第 4 步的期望输出第一行：`15 pulls / 108 mobs / 825 forces`。

### 2.1 红玉新生池（2026-10-30 新增，第二条路线）

```bash
curl -sL -o .tools/tmp/kg-ruby-route.html \
  "https://keystone.guru/route/ruby-life-pools/Xnxx3lT/skandar-tank-ruby-life-pools-10-to-16"
curl -s  -o .tools/tmp/kg-ruby-facade.js \
  "https://assets.keystone.guru/compiled/v16.2.2/mapcontext/data/ruby-life-pools/1088/facade.js"
curl -s  -o .tools/tmp/kg-ruby-data.js \
  "https://assets.keystone.guru/compiled/v16.2.2/mapcontext/data/ruby-life-pools/en_US.js"

node scripts/import-route.mjs --dungeon=ruby-life-pools \
  --route=.tools/tmp/kg-ruby-route.html \
  --mapping=.tools/tmp/kg-ruby-facade.js \
  --data=.tools/tmp/kg-ruby-data.js \
  --out=content/routes/waves-ruby-life-pools.json
```

期望输出：`12 pulls / 76 mobs / 554 forces`（路线页 enemyForces 554，门槛 551）。

地形图（页面第④段那张）：路线页能读出该副本的瓦片路径
`https://assets.keystone.guru/tiles_webp/df/rubylifepools/<floor>/<zoom>/<x>_<y>.webp`，
每张 384×256，取 4×4 拼成 1536×1024：

```bash
for x in 0 1 2 3; do for y in 0 1 2 3; do
  curl -s -A "Mozilla/5.0" -o .tools/tmp/tiles/ruby/$x\_$y.webp \
    "https://assets.keystone.guru/tiles_webp/df/rubylifepools/3/2/$x\_$y.webp"
done; done
# 用 PIL 按 (x 列, y 行) 贴到 1536×1024 画布，存 content/maps/ruby-life-pools.webp
```

底图入库放 `content/maps/`，`npm run build` 会复制到 `dist/maps/`——`dist/` 不入库，底图不能只留在那里。

两处与毒牙祭坛不同的口径：

- **阶段名**：红玉按「遇到过几个 BOSS」推（`approach` → `after-first-boss` → `after-second-boss` → `after-final-boss`），毒牙祭坛保留原有六段名（`inner-altar` 等，L1 节奏图要读）。
- **一波两个 BOSS**：红玉 p11 是 Kyrakka + Erkhart Stormvein 同波，`encounter` 写全名（`Kyrakka / Erkhart Stormvein`），不能只记第一个。

## 3. 三道自校验（脚本内建，不通过就停）

1. 路线里每个 enemy 实例 id 必须能在**同版本** mapping 中找到；
2. 每个 pull 的 forces 之和必须等于路线页的 `enemyForces`（825）；
3. NPC 单体 forces 缺失直接失败，不用 0 兜底。

外加两个硬断言：`mappingVersion.id !== 1085` 或 `dungeon_id !== 182` 就报错。上游一改版就红，不会静默错位。

## 4. 实测坑

- **`--out` 必须指向已存在的文件**。脚本读 `existing` 再展开合并（为了保住 `statExamples` 这类人工字段），文件不存在会 `ENOENT`。复现要先 `cp`。
- **合并语义的副作用**：重导不会清理旧字段。`statExamples` 是早期人工写进去的，现在的导入逻辑已经不生成它，但每次重跑都会被原样带回来。
- **路线页会 302**，落到 `/route/.../4`（key level）。`curl` 不加 `-L` 只能拿到 302。
- **版本 pin 写在资产路径里**，上游改版后旧路径 404。届时按新的 `mapping_version` 拼路径，同时改脚本里的 1085 / 182 断言。
- 与 `talentsHash` 是同一类教训：看着像身份标识的字段未必是。`talentsHash` 只有 12 字符且两套构建同值，不能用来证明构建一致；同理不能拿路线标题当路线 ID。

## 5. 分类口径与聚合

口径来自 `docs/curriculum.md` §1：

| 类型 | 判据 |
| --- | --- |
| BOSS | 波内含首领（`classification_id = 3`），**优先判定**，带小怪也算 BOSS |
| 大波 | 目标数 ≥10 |
| 中波 | 5–9 |
| 小波 | ≤4 |
| 空 pull | `mobCount = 0`，不计入分母 |

统计入口：

```bash
node scripts/route-distribution.mjs                    # content/routes/*.json 全量
node scripts/route-distribution.mjs --json             # 机器可读
node scripts/route-distribution.mjs path/to/route.json  # 指定文件
```

当前唯一一条路线（毒牙祭坛）的结果：

```
15 pull / 14 非空（空 pull 1）
大波 4 · 中波 6 · 小波 1 · BOSS 3
逐波：13 6 9 9 5 2 B 7 10 B 10 11 7 B
```

「漏斗型」（大波后紧接小波）在这条路线里是 0 次——§2 那条「84 波里 8 次」的结论没法用单条路线验证，只能等补齐路线。

**要重算 §2 那张表**，至少需要：6 条路线的 publicKey + 每条路线的 `pull → mobCount` 序列。现在仓库里一条都没有第二份，所以那张表只能当作历史依据，不能当作可复算数据引用。

## 6. 迁移到别的副本 / 别的项目

换副本要改的只有这几处，其余逻辑与三源结构无关：

| 改什么 | 位置 |
| --- | --- |
| 副本 slug 与路线 publicKey | 三个 URL、注册表里的 `sourceUrl` |
| mapping 版本 / dungeon id 断言 | `scripts/import-route.mjs` 顶部的 `DUNGEONS` 注册表 |
| 阶段名映射 | 同表里的 `phase` 函数（毒牙祭坛是六段名，红玉是按 BOSS 数推） |
| 输出文件名 | `--out` 与 `content/routes/waves-<slug>.json`（slug 必须等于章节 `map.dungeon`） |
| 地形图 | 瓦片拼接 → `content/maps/<slug 用连字符>.webp` |

`scripts/route-distribution.mjs` 只依赖 `{ waves: [{ pull, mobCount, isBoss, trashMobCount }] }`，不含本站其他 schema，可直接拿去别的项目统计波次分布。

## 7. BOSS 带小怪：现状与验证结论

毒牙祭坛有 2 波 BOSS 与小怪同波：p10（11 只，其中小怪 10）、p15（7 只，其中小怪 6）。2026-10-29 起按方案 2 处理：`import-route.mjs` 按**全场目标数**给这两波分档（p10 → `w30_8`，p15 → `w30_7`），并在波次上写 `approximation` 标记；页面照常出数，但顶部与当前波都必须标注「近似 · 按 N 目标档」。配对直接用现成的 `dec_voidform_on_{1,0}__w30_{8,7}__5000`，**没有重跑模拟**。没有 `approximation` 的 BOSS 混小怪仍然走 `mixed-boss` 拦截。

为什么木桩替代不了：存档里最接近的两个端点差 4.6 倍——单体 BOSS 90s（`trace_archon__w90_1b__5000`）27.5 万，7 目标 30s（`trace_archon__w30_7__5000`）127.5 万。连 2 目标 30s（`w30_2`）都有 57.9 万，说明**目标数才是主因**。p15 是「1 BOSS + 6 小怪」，取哪个端点都不对；而且两端差得远超误差（各场景 CI 在 ±0.6%~1%），不能像 s2 那样判成「误差内」。

2026-10-29 实测三条路，都不通：

| 做法 | 结果 |
| --- | --- |
| 命令行传 `raid_events+=/adds,count=6,type=add,...` | 静默忽略。1 目标 30s 下 DPS 41.45 万 → 41.59 万，落在 ±0.6% 误差内；对照 `dungeon=x` 这种真未知选项会打印 `Trivial: Warning: Unknown option`，所以 `raid_events` 是「认得但没登记」 |
| profile 尾部追加同一行再跑 | 同样无效：基线 41.45 万，追加后 41.59 万 / 41.66 万（300 迭代，三次都在噪声内） |
| `fight_style=DungeonSlice` | 本构建内置的是**合成副本**：`Target: Dungeon humanoid enemy`，自带 `raid_event=/adds,name=Boss,count=1,cooldown=500,duration=135,type=add_boss`；`dungeon=` 是未知选项，选不了真实副本 |

另一个事实：profile 的 APL 里已经有 `raid_event.adds.exists` / `.in` / `.count` 分支（`MID2_shadow_archon.simc` 第 40、51、80、91、104 行），但现有场景从不声明 raid event，所以这些分支在全部已有 run 里都是**死分支**——和优先级表里那些 0 施放技能是同一类问题。

三条出路（2026-10-29 已拍板选第 2 条）：

1. 换支持 `raid_events` 的 SimC 构建或版本，再补「1 BOSS + n 小怪」场景——未采用；
2. **已采用**：用 `desired_targets=n` 做近似，BOSS 计入目标数，页面显式标注「近似 · 按 N 目标档」，波次数据里留 `approximation` 标记；
3. 维持不补，页面继续写「不显示差值」——未采用。

对应 `docs/HANDOVER.md` P1 #6。
