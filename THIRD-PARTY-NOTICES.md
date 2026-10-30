# 第三方素材与非官方声明

## 许可分区

| 范围 | 许可 |
| --- | --- |
| `apps/`、`packages/`、`scripts/`、`tests/` 与仓库根配置文件 | MIT（见 `LICENSE`） |
| `content/` 教学正文与图表数据、`docs/` 讲解 | CC BY-NC 4.0（见 `LICENSE-CONTENT`） |
| 本文件列出的第三方素材（暴雪、keystone.guru、WCL、SimC 等） | 归各自权利人，本项目只按下列限度引用 |

`LICENSE` 保持标准 MIT 原文不动（GitHub 靠逐字匹配识别许可）；范围说明写在这里，不写进许可文件。

## 非官方声明

本项目是**玩家自制的教学工具**，与 Blizzard Entertainment 无任何关联，未获其授权、
赞助或背书。World of Warcraft、World of Warcraft: Midnight 及相关名称、技能名、怪物名、
地名、地图美术、图标均为 Blizzard Entertainment, Inc. 的商标或版权素材，其一切权利归暴雪所有。

## 内容来源与许可状态

| 素材 | 用途 | 来源 | 许可 / 状态 |
| --- | --- | --- | --- |
| 模拟数值（DPS、爆发增量、误差、属性曲线） | 页面所有模拟口径的数字 | 本地 SimulationCraft 1210-01 构建，590+ 个 runId 记录在 `content/sims/` | 只存**结果数字**与本仓库的配置文件；SimC 本体与其源码不进仓库 |
| 战斗日志统计与阶段 | L0-04 / L1 / L2 的高手对照 | 由用户自行从 Warcraft Logs 导出的**事件表 CSV**（`content/logs/`） | 用户自有导出；页面不转载 WCL 的图表与文字 |
| 副本路线与波次构成 | L2 副本页的路线条 | keystone.guru 公开路线页与 mapping 数据（`content/routes/`） | 按非商业引用，页面与文档保留来源链接；**不声称拥有**这些数据 |
| 地牢地形图 | L2 副本页第④段底图 | keystone.guru 瓦片（`content/maps/*.webp`，脚本拼接） | 同上：非商业引用、注明来源。商用须自行替换为自有或已授权底图 |
| 技能中文名 | 页面显示技能 | 游戏内中文名 + 社区攻略交叉核对（`content/guides/skills.json`，分 `verified` 两档） | 中文名来自暴雪本地化；`verified:false` 的行同时显示英文键名 |
| 攻略结构与顺序核对 | 优先级表交叉验证 | Archon / Icy Veins / Wowhead / Method / Maxroll / NGA | **只作核对参考**，不转载其正文；结论以本仓库 runId 为准（`content/guides/crosscheck-archon.json`） |
| 设计规范参考 | 排版与色彩 | 项目内只读镜像 `.refs/`（不入库） | 仅作学习参考，未复制其代码或素材 |

## 使用建议

- **非商业使用**（自学、教学讨论、非营利的社群分享）：按 `LICENSE-CONTENT`（CC BY-NC 4.0）
  署名即可。
- **商业使用**（付费课程、企业内训、带广告的站点、二次售卖）：需取得书面授权；
  同时必须**替换 keystone.guru 底图与路线数据**，因为本仓库对这些素材只取得非商业引用的限度。
- 转载模拟数字时请一并保留：SimC 版本、commit、迭代数、95% CI 与日期（页面证据条里都有）。
  去掉这些数字就没有意义了。
