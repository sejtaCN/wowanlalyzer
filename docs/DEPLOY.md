# 静态部署预演（上线前的最后一段）

目标：把只读版本放到一个**平台临时域名**上，先不买域名、不绑域名、不开账号体系。

## 0. 现在到哪一步了

| 步骤 | 状态 | 说明 |
| --- | --- | --- |
| 构建产物可用 | ✅ 已验证 | `npm ci && npm run build` → `dist/`（单文件 `index.html` + `maps/`） |
| 离线双击可用 | ✅ 已验证 | 双击 `dist/index.html` 即可，底图在 `dist/maps/` |
| **静态托管可用** | ✅ 已验证 | `npm run check:static`：本地起 HTTP 服务真实加载一遍，0 个失败请求、12 章可开、底图 1536px 正常 |
| 许可与声明 | ✅ 已补 | `LICENSE`（代码 MIT）/ `LICENSE-CONTENT`（内容 CC BY-NC 4.0）/ `THIRD-PARTY-NOTICES.md` |
| 平台账号授权 | ⬜ **需要你操作** | 见下节，我用不了你的登录态 |
| 自定义域名 / SEO / 章节 URL | ⬜ 未开始 | 预演通过后再谈，属 P3 |

## 1. 选一个平台（建议顺序）

| 平台 | 免费额度 | 部署方式 | 备注 |
| --- | --- | --- | --- |
| **Cloudflare Pages**（建议） | 静态站点免费、带宽不计量 | 连 GitHub 仓库，构建命令 `npm ci && npm run build`，输出目录 `dist` | 国内访问一般可用；后续加自定义域名也在这家 |
| Netlify | 100GB/月 | 同上，可仓库内放 `netlify.toml` | 上手最快 |
| Vercel | 100GB/月 | 同上 | 对纯静态略重 |

三者都不需要改代码：产物是单文件 + 一个 `maps/` 目录，路径全是相对路径（`base: './'`）。

**唯一必须注意的那件事**：`dist/maps/` 一定要一起上传。底图不在单文件里，只在 `dist/index.html` 里内联的话 L2 副本页会破图。这一步已由 `npm run build` 自动完成（`scripts/sync-maps.mjs`），平台只要输出目录填 `dist` 就不会漏。

## 2. 需要你做的（我做不了的部分）

Cloudflare Pages 为例：

1. 登录 <https://dash.cloudflare.com/>，左侧 **Workers & Pages → Create → Pages → Connect to Git**；
2. 授权 Cloudflare 访问 **sejtaCN/wowanlalyzer**（只读代码权限即可）；
3. 构建设置填：Framework preset = `None`、Build command = `npm ci && npm run build`、Build output directory = `dist`；
4. 首次部署后把临时域名（`xxx.pages.dev`）发我，我用它再跑一遍线上核对（见 §3）。

Netlify / Vercel 的差别只在菜单路径：Netlify 用 **Add new site → Import an existing project**，Vercel 用 **Add New → Project**，构建命令与输出目录填一样的两项。

## 3. 上线后我会做的核对（拿到域名就能跑）

- 用无头浏览器打开线上地址，复查：0 个 4xx、12 章入口、红玉路线条 12 柱、底图 `naturalWidth > 0`、无 console error；
- 404 行为：随便访问一个不存在的路径，应返回 404 而不是把 `index.html` 顶上去（本项目是状态切换、没有 URL 路由，不需要 SPA 回退）；
- 缓存头：`index.html` 不缓存（或 `max-age=0, must-revalidate`），`maps/*.webp` 可长缓存；
- 口径核对：线上页脚/README 的许可与来源链接可点开。

## 4. 上线前检查表

- [x] 构建命令与输出目录写清（`npm ci && npm run build` / `dist`）
- [x] 底图随构建同步到 `dist/maps`（`scripts/sync-maps.mjs`）
- [x] 许可：代码 MIT、内容 CC BY-NC 4.0、第三方与非官方声明
- [x] 单文件里没有 `file://` 专用写法、没有绝对路径
- [x] `index.html` 内联 favicon，不额外发请求（不会有 `/favicon.ico` 404）
- [ ] 平台账号与仓库授权（等你）
- [ ] 临时域名拿到后做线上核对（我做）
- [ ] 若公开宣传：在仓库简介写「非官方、非商业，暴雪素材权利归 Blizzard」

## 5. 已知风险

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| keystone.guru 底图与路线数据的引用限度 | 商业使用不被允许 | 商用前替换为自有/已授权底图与路线；已在 `THIRD-PARTY-NOTICES.md` 写明 |
| 版本更新后数字变化 | 线上旧数字会过时 | 重新跑批 + `npm run validate:content` 再部署；页面证据条带 SimC 版本与日期 |
| 单文件 780KB 左右 | 首次加载约 170KB gzip | 已可接受；若加更多数据再考虑拆分 |
| 平台免费额度调整 | 可能限流 | 纯静态、无后端，换平台成本低（产物就是 `dist/`） |
