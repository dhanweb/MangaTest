# 可移植漫画路径与无损迁移

## Goal

交付 Windows/WSL 可移植路径基础和漫画核心的无损迁移能力，使同一 MangaTest 数据库备份可在停止原后端后迁移到另一环境，并使用同一组 comic/local-file/chapter/page/tag/progress ID 读取 Windows 文件系统中的目录、zip 和 cbz。

## Requirements

- 检测 `windows`、`wsl`、`linux` runtime profile，并支持显式覆盖。
- 新增 manga root location 数据模型；逻辑 root ID 不依赖绝对路径。
- `manga_root_id + portable relative_path` 是 local file 稳定身份。
- 提供唯一的 root/file path resolver，library、local-files、reader 和 media-assets 不再把 legacy absolute path 当跨平台真值。
- root location 不可用时阻止扫描，不执行 missing reconciliation。
- 提供纯读 dry-run、SQLite backup、active-download guard、事务迁移、invariant verification 和 rollback 指引。
- 迁移不得移动真实漫画文件或改变任何漫画业务实体 ID。
- 后台展示 runtime profile、location 状态、迁移预览和 apply gate。
- 当前 profile 下继续同步 legacy absolute columns，保留单版本回滚能力。

## Acceptance Criteria

- [ ] Windows 与 WSL runtime profile 检测和显式覆盖有单元测试。
- [ ] portable relative path 拒绝绝对路径、盘符、UNC、NUL 和越界段。
- [ ] 旧数据库 backfill 当前 profile location 后，comic/local-file/chapter/page/tag/progress ID 不变。
- [ ] dry-run 不写数据库，并正确建议本地盘符到 `/mnt/<drive>` 的 WSL location。
- [ ] 迁移 apply 前自动创建可恢复 SQLite backup，并在单事务中更新 location/派生路径。
- [ ] 迁移后的首次扫描按 root ID + relative path 对账，不新增重复 comic/local file。
- [ ] root offline 时扫描被阻止，已有漫画不会批量变 missing。
- [ ] 目录、zip、cbz 的扫描、封面、缩略图和 pageId 阅读在两种 profile 下通过。
- [ ] 后台可以查看 profile/location 状态、执行 dry-run，并且必须确认 backup 和 target verification 后才允许 apply。

## Out of Scope

- PixivDownloader、Downloads/aria2、video-library、资源管理器和 PotPlayer；由 sibling task `08-26-cross-platform-path-integrations` 交付。
- 同时运行 Windows 与 WSL 后端。
- 移动真实漫画文件。
