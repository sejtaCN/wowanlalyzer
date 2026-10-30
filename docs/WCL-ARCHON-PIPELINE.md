# WCL 暗牧执政官：8 本大秘境数据提取与定稿流程

> 目标：每个赛季副本都留下同一套可复核证据，最终供 Archon 暗牧页面生成
> 「打法总结 / 修正 / 优化」，不用翻聊天记录或重新猜数据口径。

## 1. 最终要交付什么

每本副本固定产出四层：

| 层 | 产物 | 用途 |
| --- | --- | --- |
| 来源清单 | `content/logs/wcl-archon-sources.json` | 记录 WCL encounterId、报告代码、fightId、玩家、职业/专精/英雄天赋、Key、原始快照路径 |
| 原始筛选事件 | `.tools/tmp/archon-<slug>-filtered-events.json` | 只存在于本机，保留页面时间、事件文字、分页 URL 和筛选表达式 |
| Pull 级数据 | `content/logs/<dataset>-events.json` + `-phases.json` | 站点读取的标准数据；按 WCL Fights 的真实 Pull 切段 |
| 打法结论 | `content/strategy/archon-dungeons.json` | 总结、修正、优化；每条都必须能回到 Pull/事件 |

状态只有四种：

- `pending`：还没有 Pull 级样本。
- `phase-only`：有旧日志，但只能到区域/BOSS 阶段，不能冒充单 Pull。
- `sample-reviewed`：单样本 Pull 级数据已抽取，候选结论等待人工定稿。
- `final`：数据和打法结论都经过人工复核。

## 2. 8 本范围

`content/logs/wcl-archon-sources.json` 已登记：

| 副本 | WCL encounterId | 报告 / 玩家 | Key | Pull 级数据 |
| --- | ---: | --- | ---: | --- |
| Altar of Fangs | 12993 | `tHAzZ4bpaFCdNDmB` / Slicecrisps | +21 | ready，10 Pull |
| Den of Nalorakk | 12825 | `GXHZWNKtvfwMQ6Bx` / Çorruptêd | +22 | ready，11 Pull |
| Kings' Rest | 61762 | `Nj9cF8kQ3XGW2y1J` / 列兵天使 | +22 | ready，11 Pull |
| Murder Row | 12813 | `CayqdzpNBZLkbMR3` / 网红镇 | +22 | ready，15 Pull |
| Ruby Life Pools | 112521 | `j9YnMJVfBzgHwvcD` / Dukkie | +21 | ready，8 Pull |
| Temple of Sethraliss | 61877 | `Nj9cF8kQ3XGW2y1J` / 列兵天使 | +22 | ready，9 Pull |
| The Blinding Vale | 12859 | `J1pnX7WmcNZd2R6g` / 小花生 | +23 | ready，9 Pull |
| Voidscar Arena | 12923 | `yGNACM1w7PzJ4ZjH` / 悲嘆之息 | +22 | ready，8 Pull |

运行覆盖率报告：

```bash
npm run wcl:archon:status
```

加 `--strict` 时，只有 8 本全部达到 Pull 级才返回成功：

```bash
npm run wcl:archon:status -- --strict
```

## 3. 选样标准

排名入口模板：

```text
https://www.warcraftlogs.com/zone/rankings/55?boss=<encounterId>&class=Priest&spec=Shadow&metric=dps&heroTree=19
```

选样顺序：

1. 必须是当前赛季的 Mythic+ 完整通关报告。
2. 必须是暗影牧师、执政官。
3. Key 层接近该副本可获得的高层样本；同层优先高 DPS、近期日志。
4. 打开报告后确认是整本地下城，不是单个 BOSS 的独立 fight。
5. 记录报告代码、fightId、角色名、actor ID、Key、全程时长。
6. 公开报告可以浏览；遇到真人验证时由用户完成，不绕过验证。

不要拿：

- 未分段的旧导出冒充 Pull 级。
- 别的英雄天赋。
- 别的副本或别的玩家补洞。
- 只有伤害摘要、没有事件的报告。

## 4. 提取 WCL 事件

在报告的 Events 页：

1. 左侧来源选目标暗牧。
2. 使用 Default View；CSV 导出要求 Default View。
3. 在 Filter Expression 填入：

```text
(type = "cast") OR
(type in ("applybuff", "refreshbuff", "removebuff", "applydebuff", "refreshdebuff", "removedebuff")
 AND ability.name in ("Voidform", "Vampiric Touch", "Shadow Word: Pain",
                      "Shadow Word: Madness", "Horrific Visions")) OR
type in ("death", "encounterstart", "encounterend")
```

4. 记录每页第一行和最后一行的绝对时间，一直点 Next Page 到没有下一页。
5. 每页读取默认表的 `Time` 与 `Event` 两列；不要只导第一页 CSV。
6. 原始快照写成：

```json
{
  "sourceUrl": "https://www.warcraftlogs.com/reports/<code>?fight=<id>",
  "sourceFilter": "<玩家与来源过滤说明>",
  "expression": "<上面的表达式>",
  "pages": [{ "url": "...", "count": 300, "first": "00:00.000", "last": "00:25.000" }],
  "events": [{ "time": "00:06.324", "event": "Player casts ...", "pageUrl": "..." }]
}
```

保存到：

```text
.tools/tmp/archon-<slug>-filtered-events.json
```

`.tools/` 不入库；可提交的是归一化后的 `content/logs/*.json`。

## 5. 登记 Pull 边界

WCL Fights 页的 Phase 下拉会列出 Pull 序号、时长和主要目标。按以下格式写进来源清单：

```json
{
  "index": 1,
  "kind": "area",
  "label": "Defier Draghar",
  "from": 10,
  "to": 229
}
```

规则：

- `from` / `to` 是整场报告的绝对秒数。
- `kind` 只填 `area` 或 `boss`。
- `label` 用 WCL Pull 名，不改写成未经验证的路线波名。
- WCL Pull 与 keystone.guru 路线波次不要求一一对应；关联只按怪物族重合度计算。

把该副本来源清单里的 `wclStatus` 改成 `ready`，并填好：

```text
reportCode / fightId / player / playerActorId / keyLevel / durationSec / rawSnapshot
events / phases / expected
```

## 6. 一次归一化 8 本

所有 `wclStatus=ready` 的副本：

```bash
npm run logs:wcl:all
```

只重跑一本：

```bash
npm run logs:wcl-pages -- --dungeon=ruby_life_pools
```

归一化会生成：

- 每个 Pull 的施法数、GCD 中位、活跃时间、Top casts。
- 虚空形态起止窗口。
- 四个核心 DoT 的全量覆盖区间。
- 每段目标族与 keystone 路线重合度。
- 与事件文件一一对应的 phases 文件。

`logs:wcl:all` 只处理 `ready` 项；看到 `pending` 不会用空数据填补。

## 7. 生成打法总结 / 修正 / 优化

编辑 `content/strategy/archon-dungeons.json`。每条结论固定写三段：

| 字段 | 写什么 |
| --- | --- |
| `title` | 一句可执行判断 |
| `evidence` | Pull 序号、时间、窗口数、DoT 覆盖率等可回查事实 |
| `action` | 下一把具体怎么做 |

分类：

- `summary`：这本副本的共同决策，例如短波是否留爆发、长战斗如何拆窗口。
- `corrections`：样本里能看到的具体偏差；不能仅凭次数判错时写“需复核”。
- `optimizations`：不改变事实口径的优化，例如爆发分配、DoT 起手。

没有 Pull 级来源时，三条结论必须是空数组，不能先用文字占位。

## 8. 收口门禁

每本做完后至少跑：

```bash
npm run wcl:archon:status
npm test
npm run typecheck
npm run validate:content
npm run check:doc
npm run check:copy
npm run check:design
npm run check:ui
npm run check:static
npm run audit:text -- --strict
npm run verify:gates
```

8 本全部达到 `ready` 且策略为 `final` 后：

```bash
npm run wcl:archon:status -- --strict
```

## 9. 当前基线

8 本均已完成单样本 Pull 级数据提取，合计：

- 329 个 WCL 事件页
- 97,599 条筛选事件
- 81 个有效 Pull
- 100 个虚空形态窗口
- 12,147 个 DoT 区间

打法汇总中的 8 本均为 `sample-reviewed`：数据可复核，候选结论已落库，
但仍需人工复核后才能把状态改为 `final`。因此：

```bash
npm run wcl:archon:status
```

应报告 `ready 8`；`--strict` 仍应因打法定稿数不足而失败，这是预期的质量门禁。
