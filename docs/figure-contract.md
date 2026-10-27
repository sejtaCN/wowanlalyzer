# 图契约与门禁（2026-10-26）

> 唯一图清单：`content/figures/chapters.json`。章节 JSON 只放内容，图有没有、缺什么、下一批补什么，都看这份清单。

## 1. 五段各有什么

每一章固定五段，契约也是五条：

| 字段 | 含义 |
| --- | --- |
| `section` | 1–5，必须与页面段号一致 |
| `kind` | 图类型，必须在该文件 `kinds` 白名单里 |
| `status` | `ready` 有真实图/表；`missing` 缺图；`not-applicable` 这一段本来就不该有图 |
| `source` | `ready` 必填：runId、logId 或路线文件；`missing` 也写清需要补什么 |
| `note` / `next` | 边界说明 / 缺图排到哪一批 |

`ready` 不代表四约束已经讲全，只代表这一段已有对应图形或表格。缺图归 `missing`，不得拿纯文字占位或一句说明冒充。

当前基线：11 章 × 5 段 = **55 段**，其中 **48 段有图、2 段缺图、5 段不适用**。缺图会在 `validate:content` 和 `check:ui` 中逐条列出，不阻塞现有内容，但不能再被误报成“每段都有图”。

## 2. 两道门禁各查什么

`npm run validate:content`：

- 每章契约必须 5 段、编号不能错位；
- 图类型必须在白名单；
- `ready` 必须有来源；
- `missing` 必须写下一批；
- 第②段图类型要与 `chapter.chart.kind` 一致（L2 的 `selected-wave` 例外）；
- 未知主图类型、契约缺章直接失败。

`npm run check:ui`：

- 先构建，再打开 `file://dist/index.html`，避免验到旧包；
- 从首页逐章点开 **11 章**，核对标题、720 宽、顶图带 3 格、五段、段标题和一句说明；
- 按契约逐个 `ready` 段找真实 DOM 图元（图、表、三步卡、时间轴等）；找不到就失败；
- 缺图只打印警告；`not-applicable` 不要求图；
- 截图逐章落到 `.tools/tmp/ui/chapter-<id>.png`。

## 3. 门禁自身要有坏样本

`npm run verify:gates` 做四件事：

1. 原图契约跑 `validate:content`，必须通过；
2. 临时把 L1-02 契约删成 4 段，必须失败并报「图契约必须有 5 段」；
3. 原构建产物跑 `check:ui`，必须通过；
4. 临时构建副本里把 `df-step` 类名改坏，必须失败并报「DOM 未渲染对应图」。

四项全过，才算门禁不是空转。坏样本只写系统临时目录，不修改仓库内容。

## 4. 改图时的顺序

1. 先确定这一段回答什么、数据从哪来；
2. 在契约里把 `kind/source/status` 写对；
3. 实现图组件，给根元素加 `data-figure-kind`；
4. 页面段壳从契约取状态，不再手写“有图”；
5. 跑 `validate:content`、`check:ui`、`verify:gates`；
6. 状态确实变成真图后，才从 `missing` 改成 `ready`。
