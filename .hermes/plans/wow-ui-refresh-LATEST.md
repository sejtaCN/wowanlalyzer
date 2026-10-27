# WoW UI 优化交接：当前版本指针

- 当前版本：`v1.1.0`
- 更新时间：`2026-10-27T19:25:00+08:00`
- 应用基线：`master ee48676` + `codex/restore-build-baseline` 基础修复
- 主文件：`.hermes/plans/2026-10-27_192500-wow-ui-refresh-v1.1.0.md`
- Git blob：`328f52c7c03fd0d2009e8f7848fee4afa7c20f2d`
- 已恢复：可构建数据层、11 章 UI 门禁、Windows 浏览器发现、LF / CRLF 文档解析

子代理必须先读本指针，再核对主文件头部版本并运行：

```bash
git hash-object .hermes/plans/2026-10-27_192500-wow-ui-refresh-v1.1.0.md
git status --short --branch
git log -1 --oneline
```

版本、路径、Git blob、当前分支或委派任务给出的预期值有任何不一致，或 Git 出现未解释改动，立即停止并报告；不得继续按旧文件执行。基础修复若尚未提交，允许出现本指针列明范围内的预期差异；UI 执行仍从 B1 开始。

主文件更新时：升版本、换带新时间戳和版本的文件名、用 `git hash-object` 重算仓库内容哈希，并更新本指针。不要使用受 CRLF 影响的工作区文件 SHA-256，也不要只改正文而保留旧版本号。
