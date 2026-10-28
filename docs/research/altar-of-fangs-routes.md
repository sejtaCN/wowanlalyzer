# Altar of Fangs 波次与属性证据核对

核对日期：2026-10-28

## 结论

Keystone.guru 的公开路线 `xwt8Pza` 当前仍可读取，但旧短链返回 Route removed。以完整路线 URL 为准。

页面内嵌路线数据给出 **15 个 pull、108 只怪、825 点 forces**；同版本 mapping 的通过门槛为 **817**。旧本地文件写 14 pull，是因为把第 12 个空 pull 去掉了；保留原索引后，第 13/14/15 pull 的编号与 Keystone 页面一致。

## 数据链

| 来源 | 内容 | 版本 | 用途 |
| --- | --- | --- | --- |
| Keystone.guru 路线页 | killZones、enemy instance id、路线备注 | mapping v1085 | pull 分组与敌人实例 |
| Keystone.guru mapping JS | enemy id → NPC id、坐标、单体 forces | v1085 / MDT 6.2.20 | 把 enemy 实例映射到名称与 forces |
| Keystone.guru dungeon JS | NPC id → 名称、分类、血量 | retail | 名称与 BOSS 分类 |
| MDT `Midnight/AltarOfFangs.lua` | 全本敌人、坐标、组号、817 门槛 | MDT master | 作为独立实现交叉核验 |
| Raider.IO 公开跑本页 | 三个 BOSS 的击杀时间 | season-mn-2 | 阶段顺序旁证，不用于 pull 边界 |

## 核验

- force 合计：77 + 56 + 59 + 69 + 49 + 50 + 0 + 59 + 74 + 54 + 83 + 0 + 51 + 59 + 85 = **825**。
- 通过门槛：**817**。
- 路线 BOSS：Rav'i、The Writhing Coil、Zul'jan。
- 第 10 pull 混有小怪，不能把“单体 BOSS 木桩”直接当成这一 pull 的模拟结果。
- 第 12 pull 是空 pull，属于路线中的停顿/分段标记；不再删除后重排编号。

## 来源链接

- Keystone 路线：`https://keystone.guru/route/altar-of-fangs/xwt8Pza/skandar-tank-altar-of-fangs-10-to-16-keys`
- Keystone 地图数据：`https://assets.keystone.guru/compiled/v16.2.2/mapcontext/data/altar-of-fangs/en_US.js`
- Keystone mapping：`https://assets.keystone.guru/compiled/v16.2.2/mapcontext/data/altar-of-fangs/1085/facade.js`
- MDT：`https://github.com/Nnoggie/MythicDungeonTools/blob/master/Midnight/AltarOfFangs.lua`
- Raider.IO 示例跑本：`https://raider.io/mythic-plus-runs/season-mn-2/22323826-18-altar-of-fangs`

## 属性结论交叉核验

同时参考：

- Icy Veins 12.1.5 Stat Priority：Archon 单体推荐 Mastery 1200–1400、Crit 800–1200、Haste 1400–1600、Vers ≤400；Archon 多目标推荐 Mastery 1000–1200、Haste 1600–1800、Crit 800–1200、Vers ≤400。
- Method 12.1 Stats：Archon ST 为 Mastery > Haste > Crit > Vers；Archon AoE 为 Haste > Mastery > Crit > Vers。

本站模拟与外部来源的交集：

- 两方都认为 Mastery 与 Haste 是 Archon 的主要属性，Crit 与 Vers 次之。
- 本站多目标优化里，8 目标的最优分配是 Haste 1300、Mastery 1100，方向与 Method 的 AoE 排序一致；单体则 Mastery 1500、Haste 900，方向与 Method 的 ST Mastery-first 一致。
- 分歧：Icy Veins 的 ST Haste 目标为 1400–1600，而本站 3209 点评级预算下的 ST 最优 Haste 只有 900；这不是同一约束下的直接矛盾，而是“来源给范围、本站给固定预算最优点”。页面不能把两者混成一张曲线。

因此属性来源只能作为方向核验；具体分配以 `stat-opt-archon.json` 的实测点为准，且跨目标模型不可横比 DPS。
