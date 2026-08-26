# Windows 与 WSL 路径兼容和无损迁移

## Goal

让 MangaTest 可以选择 Windows 或 WSL 作为唯一长期运行后端，并允许用户通过受控的备份、恢复和路径映射流程，把现有数据库迁移到另一种运行环境。迁移不得移动或删除真实漫画文件，不得改变漫画业务身份、metadata、标签、章节、页面、合并关系或阅读进度。

## Background

- 当前 Windows 数据库使用 Windows 绝对路径，例如系统漫画根目录 `D:\hentai\manga`、Pixiv 根目录 `D:\hentai\pixiv` 和 PixivDownloader SQLite `C:\Program Files\PixivDownload\data\pixiv_download.db`。
- 当前 WSL 环境可以通过 `/mnt/d/hentai/manga`、`/mnt/d/hentai/pixiv` 和 `/mnt/c/...` 访问相同的 Windows 文件。
- Node `path` 使用当前运行平台语义；WSL 不会把 `D:\...` 识别为绝对路径。当前路径校验直接调用平台 `path.isAbsolute`（`apps/web/src/modules/local-files/path-safety.ts:20`）。
- `manga_roots.absolute_path` 和 `local_files.absolute_path` 当前被多个扫描、Reader、缓存、下载和维护流程直接作为文件系统真值使用（`apps/web/src/modules/core/db/schema.ts:56`、`apps/web/src/modules/core/db/schema.ts:127`、`apps/web/src/modules/reader/page-images.ts:36`）。
- `local_files` 已保存 `manga_root_id + relative_path`，并有唯一约束（`apps/web/src/modules/core/db/bootstrap.ts:161-184`）；这可以成为跨平台稳定文件身份。
- PixivDownloader 当前强制使用 Windows 路径解析（`apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/path-resolver.ts:99-104`），不能直接把 `/mnt/...` 当成运行时路径。
- SQLite 默认位于应用工作目录的 `.data/mangatest.sqlite`，并使用 WAL（`apps/web/src/modules/core/db/client.ts:9-23`）。Windows 与 WSL 不得同时打开同一数据库文件。

## Confirmed Product Decisions

- Windows 或 WSL 中只选择一个作为长期唯一后端；不支持两个后端同时运行或同时访问同一 SQLite。
- 兼容目标包括数据库可在停止原后端后，通过备份/恢复迁移到另一运行环境；不要求高频热切换或实时同步。
- 漫画文件可以继续保存在 Windows 文件系统中，WSL 通过挂载路径访问。
- 项目代码、原生依赖、SQLite、`.next` 和缓存优先放在当前后端的原生文件系统中。
- 真实漫画文件不因兼容或数据库迁移而移动、重命名或删除。
- 最终目标是全量兼容当前所有本地路径消费者，采用分阶段交付：先完成漫画核心和无损迁移，再完成 PixivDownloader、downloads/aria2、video-library、资源管理器和 PotPlayer。

## Task Map

- `08-26-portable-manga-paths`：运行环境 profile、逻辑根目录位置映射、dry-run/备份/迁移、root offline 语义，以及 library、local-files、reader、media-assets 和后台路径管理。
- `08-26-cross-platform-path-integrations`：基于第一个子任务提供的路径合同，兼容 PixivDownloader、downloads/aria2、video-library、资源管理器和 PotPlayer。
- 本父任务负责 `docs/plan.md` 的完整产品决策、跨子任务验收、Windows/WSL 集成验证和最终迁移演练，不直接承载独立实现。

## Requirements

### Stable identity and path model

- 漫画根目录必须有与绝对路径无关的稳定业务 ID。
- 本地文件的跨平台稳定身份必须基于 `manga_root_id + portable_relative_path`，不得基于 Windows/WSL 绝对路径字符串。
- 数据库中的 portable relative path 必须统一使用 `/`，并拒绝绝对路径、盘符、UNC 前缀和越界 `..`。
- 一个逻辑根目录可以配置多个运行位置，例如 `windows -> D:\hentai\manga`、`wsl -> /mnt/d/hentai/manga`。
- 运行时只能通过统一的路径解析服务把逻辑 root 和 portable relative path 解析为当前环境的绝对路径。
- 现有 `absolute_path` 字段在迁移期可以保留为兼容或派生字段，但不得继续作为跨平台业务身份。

### Runtime profile and availability

- 系统必须区分 `windows`、`wsl` 和普通 `linux` 运行 profile，并允许显式配置覆盖自动检测。
- 每个 root location 必须独立验证存在性、目录类型和可访问性。
- 当前 profile 没有 location、盘符未挂载或根目录不可访问时，应显示“根目录未配置/离线”，禁止扫描，不得批量把漫画标记为缺失。
- 自动建议 `D:\path -> /mnt/d/path` 仅作为建议；必须在目标环境验证后才启用。UNC、自定义 WSL mount root 和非 Windows Linux 路径不得静默猜测。

### Safe migration

- 迁移前必须停止所有 MangaTest 实例并检查运行中的下载任务。
- 迁移必须先创建 SQLite 一致性备份和人类可读的 dry-run 报告。
- dry-run 必须列出 root 映射、受影响路径记录、不可映射路径、目标可用性和预期数据计数。
- 数据迁移必须在单个数据库事务中保留 `comic`、`local_file`、`chapter`、`page`、tag、source、merge 和 progress ID。
- 迁移不得把目标 WSL 路径注册成一个新的逻辑 manga root。
- 首次迁移后扫描必须通过 `manga_root_id + relative_path` 对账，不得为同一物理内容新建重复漫画。
- 迁移失败时必须能通过备份恢复；回滚不涉及真实漫画文件。

### Data and cache behavior

- 历史操作日志和历史同步结果中的旧路径作为审计信息保留，不要求改写。
- 绝对路径参与的 archive file-list、封面和缩略图缓存允许失效并懒惰重建；缓存失效不得影响漫画业务数据。
- 活跃下载任务的临时路径属于运行环境状态；存在无法安全转换的活跃任务时必须阻止迁移并给出原因。

### Documentation and administration

- `docs/plan.md` 必须在实现前补充跨平台路径身份、root location、离线语义、迁移和 SQLite 单实例约束。
- 后台必须展示当前 runtime profile、每个逻辑根目录在当前 profile 下的位置和验证状态。
- 管理员必须能预览路径迁移，不得通过普通“新增根目录”流程完成跨平台迁移。

### Full path-consumer coverage

- `library`、`local-files`、`reader` 和 `media-assets` 必须使用逻辑 root 与 portable relative path 解析当前运行环境路径。
- `video-library` 必须采用等价的逻辑 video root location 模型，视频实体和播放进度不得因路径 profile 切换而重建。
- PixivDownloader 必须把外部 Windows 路径先解析为逻辑 root + relative path，再映射到当前 runtime profile；不得在 WSL 中把 `/mnt/...` 交给 `path.win32.resolve`。
- Downloads 必须区分应用运行时路径与 provider 返回路径；Windows aria2 返回的路径只能通过显式 profile/location 映射转换，不得用当前平台 `path.resolve` 猜测。
- 打开目录操作在 Windows 使用系统文件管理器，在 WSL 中把 Linux 挂载路径转换为 Windows 路径后调用 `explorer.exe`，普通 Linux 使用 `xdg-open`。
- PotPlayer 属于 Windows 集成：Windows 可以直接启动；WSL 仅在能够安全转换媒体路径并调用 Windows 可执行文件时启用，否则明确显示不可用，不得静默失败。

## Acceptance Criteria

- [ ] 现有 Windows 数据库完成 dry-run 时，正确建议 `D:\hentai\manga -> /mnt/d/hentai/manga`，且不修改数据库或磁盘文件。
- [ ] 迁移前后 `comic`、`local_file`、`chapter`、`page`、tag、source、merge 和 reading progress 的 ID 与数量一致。
- [ ] 同一个数据库备份在 Windows 恢复后使用 Windows location，在 WSL 恢复后使用 WSL location。
- [ ] 切换环境后的首次扫描不会为已有 `manga_root_id + relative_path` 新建漫画或 local file。
- [ ] 目录漫画、zip 和 cbz 在 Windows 与 WSL profile 下都能扫描、显示封面并按 `pageId` 阅读。
- [ ] WSL 未挂载 `/mnt/d` 时，系统报告 root offline，不把整个库标记为缺失。
- [ ] 迁移过程中不创建、移动、重命名或删除任何真实漫画文件。
- [ ] 迁移失败后可以恢复一致性备份，恢复后的数据计数和关键 ID 与迁移前一致。
- [ ] Windows 与 WSL 不能同时使用同一 SQLite；文档、迁移 UI 和运行时保护均明确该约束。
- [ ] Windows 安装的 `node_modules` 不被 WSL 复用，部署文档要求在目标运行环境安装原生依赖。
- [ ] PixivDownloader 在 Windows 和 WSL profile 下对同一作品解析出同一逻辑 root + relative path，并匹配同一 comic/source identity。
- [ ] Windows aria2、WSL 内 aria2 和内置 HTTP 下载的路径方言被显式区分；无法转换的 provider path 会阻止 finalization，而不是写入错误路径。
- [ ] video-library 在 Windows/WSL profile 切换后保留 video、episode、tag、merge 和 progress ID，且能够播放同一 Windows 媒体文件。
- [ ] Windows、WSL 和普通 Linux 的“打开目录”行为分别走经过测试的平台适配器；PotPlayer 在不支持的环境显示明确能力状态。

## Out of Scope

- Windows 与 WSL 两个 MangaTest 后端同时运行或实时同步 SQLite。
- 自动移动漫画文件到 WSL 文件系统。
- 支持服务端接受客户端传入任意文件系统路径。
- 将 SQLite 替换为 PostgreSQL 或其他网络数据库。
- 对无法验证的 UNC、自定义挂载或网络共享路径进行无提示自动转换。
