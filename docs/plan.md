# MangaTest 项目计划

## 1. 项目定位

MangaTest 是一个本地自托管的个人漫画库系统。

它的第一目标不是做一个复杂下载平台，而是先把本地漫画变成可扫描、可管理、可搜索、可阅读的漫画网站。下载、浏览器插件、OpenList/115 都是后续围绕漫画库补充资源和元数据的模块。

核心原则：

- `comic` 是业务中心，表示系统里展示和管理的一本漫画。
- `local_file` 是磁盘实体，表示真实目录、zip、cbz 文件。
- `chapter` 和 `page` 是阅读器实体。
- `tag` 保存英文 canonical，展示时再通过翻译表显示中文。
- 导入和下载必须解耦。
- 删除漫画记录不等于删除真实文件。
- 真实文件删除必须是单独、显式、确认过绝对路径的操作。

### 1.1 已确认业务决策

漫画与章节：

- 默认每个漫画根目录下的子目录或压缩包是一本文本漫画。
- 后台支持把漫画合并为另一本漫画的章节。
- 合并必须可逆，不通过物理移动文件实现。
- 被合并为章节的漫画默认不出现在前台首页，后台可以筛选查看。
- 章节允许没有标题，单章节漫画不强行显示“第 1 章”。
- 章节默认自然排序，后台可手动拖拽并保存 `sort_order`。

视频库：

- 视频使用独立的一个或多个 video root，不和 manga root 混用。
- video root 下的单个视频文件是单集视频；子目录是一个视频实体，目录内文件是多集。
- 单文件视频的标题来自文件名；多集视频的标题来自目录名，集标题来自文件名；默认去掉扩展名。
- MVP 扫描 `.mp4`、`.mkv`、`.avi`、`.mov`、`.webm`、`.m4v`、`.ts`，不扫描视频压缩包。
- 集数默认自然排序，后台保留手动调整顺序的能力。
- 视频时长保存为整数秒，无法读取时长时允许为空。
- 视频详情页使用原生 video 播放器但不自动播放；播放进度绑定 `video + episode`，保存当前秒数、百分比和完成状态。
- 封面从视频首帧按需生成并缓存，失败时使用占位图。
- 视频标签复用全局 `tags` 字典，新增 `video_tags` 关联表；无命名空间的来源标签内部使用 `general` namespace，展示时隐藏 namespace。
- 视频下载任务支持后台输入直链，默认使用 aria2，完成后触发视频扫描；后续保留 Metadata Ingest/浏览器插件提交视频 metadata 和资源的能力，但本次不开发插件。
- PotPlayer 同时支持配置可执行文件路径后由本机服务启动，以及浏览器 `potplayer://` 协议启动。

本地文件与版本：

- 一个 `comic` 可以关联多个 `local_file`。
- 多个本地版本先简单展示，reader 默认读取主 `local_file`。
- 首次扫描只有一个文件时自动设为主文件，多个文件时后台可切换主文件。
- 路径修复 MVP 只修改数据库路径，不移动真实文件。
- 系统默认 manga root（`kind=system`）允许在后台修改绝对路径。修改时必须询问是否移动目录内漫画：选择“是”时执行物理迁移并更新 `local_files.absolute_path` 等关联路径；选择“否”时仅改写数据库路径。用户 manga root 暂不支持在此修改绝对路径。
- 软删除或隐藏记录后，重新扫描同一路径时保持隐藏，并在扫描结果里提示可恢复。

标题、标签和作者：

- 标题字段至少包含 `display_title`、`file_title`、`original_title`、`metadata_query_title`、`sort_title`。
- `display_title` 是用户展示名，插件再次导入不得覆盖。
- 作者作为普通标签处理，例如 `artist:xxx`、`group:xxx`，不单独建作者表。
- MVP 标签绑定在 `comic` 上，数据库预留 `chapter` 标签关系。
- 标签 namespace 允许任意值，UI 内置常见分类排序。
- 中文翻译缺失时显示英文 canonical，并给“未翻译”弱提示。
- 大小写和空格规范化可以自动处理，真正同义词合并必须后台确认。
- 用户手动编辑标签后，插件再次导入不得覆盖用户编辑，只能保留为来源标签或候选标签。

前台与后台：

- 前台首页默认只展示本地可读漫画。
- 缺文件、不可读、remote-only、隐藏内容放在后台查看。
- 前台漫画详情不显示完整本地路径，完整路径放后台。
- 前台保留低调管理入口，但不让管理能力主导漫画网站体验。

安全与访问：

- 默认只监听 `127.0.0.1`。
- 未来允许配置局域网访问，但开启非本机监听后，写 API 必须使用 token。
- 页面图片读取必须通过 `pageId`，前端不得传任意路径。
- 数据库可以保存完整资源链接，日志和 UI 默认脱敏 magnet / 私有资源 URL。

## 2. 架构思想

项目参考 NestJS 的模块化思想，但不强行引入 NestJS。

在 Next.js 里，模块不应该只是目录分组，而应该有清晰的依赖边界：

```text
app route / UI
  ↓
module application service
  ↓
domain service / repository port
  ↓
infrastructure adapter / database / filesystem / provider
```

模块之间通过明确的 service、port、event 或 command 交互，不允许页面、Route Handler 到处直接读写数据库。

推荐依赖方向：

```text
core/settings/db/logger
  ↑
tags
  ↑
library / local-files / reader / metadata-ingest / downloads
  ↑
admin UI / public manga website UI / extension API routes
```

## 3. 模块划分

### 3.1 Core 模块

负责跨模块基础设施：

- 配置读取
- SQLite / Drizzle 初始化
- 日志
- 任务状态基础类型
- 错误类型
- 简单事件分发
- 系统设置

Core 不包含漫画业务规则。

### 3.2 Library 模块

这是最简单、最核心的漫画网站模块。

职责：

- 扫描配置好的一个或多个漫画根目录
- 识别目录、zip、cbz
- 创建 comic、local_file、chapter、page 基础记录
- 提供漫画列表、详情页、基础搜索和标签筛选所需数据
- 提供缺封面、缺文件、未阅读、阅读中等展示状态
- 保存扫描批次 `scan_session`，记录新增、缺失、疑似重复、可恢复项目
- 支持后台把一个 comic 合并为另一个 comic 的 chapter
- 支持后台恢复已合并或已隐藏的记录

Library 不关心漫画元数据从哪里来，也不关心下载怎么发生。

它只关心：当前本地库里有什么漫画，能不能展示和阅读。

扫描规则：

- MVP 支持多个 manga root。
- 每个 root 预留 `scan_mode`，但第一阶段只实现“子项为漫画”。
- 启动时不自动扫描，MVP 先由后台手动触发扫描。
- 重复扫描默认新建记录，并在后台提示疑似重复，不自动合并。

本地视频目录由独立的 `video-library` 模块负责，保持与 Library 类似的应用服务边界：扫描 video root、创建视频和集数、列表/详情/搜索、标签关联、缺失文件维护和视频播放进度。视频不复用漫画的 chapter/page 业务实体。

### 3.3 Tags 模块

标签模块是独立模块，不属于插件，也不属于下载。

职责：

- 保存英文 canonical 标签，例如 `female:sole female`
- 保存中文翻译
- 保存别名
- 负责标签归类、搜索、展示文本
- 支持后续导入 EhTagTranslation / EhSyringe 映射

Library、Metadata Ingest、Admin 都可以使用 Tags。

### 3.4 Reader 模块

阅读器模块只负责阅读体验。

职责：

- 提供 reader 所需章节和页面数据
- 提供页面图片读取接口
- 保存阅读进度
- 垂直无缝阅读
- 当前页、百分比、缩略图导航
- 后续支持下一话、阅读队列

Reader 不负责扫描文件，也不负责下载。

阅读体验决策：

- 阅读进度绑定 `comic + chapter + page`。
- `comic` 保存 last_read 快照，便于首页和详情页继续阅读。
- 进度保存使用节流策略，并在页面卸载时补一次。
- 桌面端默认显示缩略图侧边栏，移动端默认隐藏，可手动打开。
- MVP 支持方向键、空格、Home、End。
- MVP 做隐藏顶部栏/侧边栏的沉浸模式，不调用浏览器全屏 API。

### 3.5 Local Files 模块

Local Files 负责磁盘事实和文件维护。

职责：

- 管理 manga root
- 检查本地路径是否存在
- 检测缺失文件
- 检测文件变更
- 修复 local_file 路径
- 计算基础文件信息
- 保存 size、mtime 和可选 hash
- 对 zip/cbz 先缓存文件列表，再按需抽取目标图片
- 对目录和压缩包都生成统一的 page source 描述

Library 可以调用 Local Files 的扫描结果，但不要把所有文件维护逻辑塞进 Library。

文件读取决策：

- zip/cbz 不完整解压。
- 先缓存压缩包文件列表。
- 读到目标页面时再按需抽取图片。
- 最近访问页面可以缓存，提高下一次阅读速度。
- 页面实体保存 `local_file_id + internal_path/page_index` 等来源信息，不把真实路径暴露给前端。

### 3.6 Media Assets 模块

Media Assets 负责应用生成的图片资产。

职责：

- 从本地漫画目录、zip、cbz 中提取封面
- 从本地视频按需截取首帧封面
- 生成列表封面缩略图
- 生成 reader 缩略图导航需要的页面预览图
- 管理缩略图缓存、失效和重新生成
- 统一图片尺寸、格式和质量策略
- 管理缓存 lastAccess
- 根据大小上限和过期时间清理缓存

Media Assets 可以被 Library、Reader、Admin 调用，但它不负责扫描入库，也不负责判断漫画业务状态。

缩略图与缓存决策：

- 不全量生成 reader 缩略图。
- 按当前页和可视区域附近懒生成。
- UI 先显示固定尺寸占位。
- 缓存命中时立即显示，未命中时后台补图。
- 缩略图缓存 key 必须包含图片路径或 sha、尺寸、用途类型。
- 生成任务必须进入队列，避免滚动时瞬间并发爆炸。
- 缓存清理使用大小上限和过期时间双策略。
- 后台预留“重新生成封面/缩略图”任务入口，MVP 可以只实现重新生成封面。

### 3.7 Metadata Ingest 模块

这是浏览器插件提交数据时命中的后端模块。

它应该独立于 Downloads。

原因：

- 插件提交的是漫画来源站信息、标签、封面、资源链接。
- 这些信息可以只入库，不一定立刻下载。
- 同一个本地漫画可以先由扫描创建，再由插件补充 metadata。
- 后续下载模块只消费已经入库的资源。

职责：

- 接收浏览器插件提交的数据
- 校验导入 token
- 规范化来源站漫画 ID、URL、标题、作者、标签、封面
- 调用 Tags 保存 canonical 标签
- 创建或更新 comic、comic_source、comic_resource
- 做重复候选匹配
- 返回当前页面是否已入库、是否已有本地文件、是否可下载

Metadata Ingest 不直接登录 OpenList，不直接提交 115 离线下载。

导入决策：

- 插件提交 metadata 时允许不带 magnet，只带来源 URL、标题、标签、封面。
- 如果没有本地漫画匹配，可以创建 remote-only / missing-local 状态的 comic。
- remote-only 默认不进入普通首页，只在后台或待下载筛选里展示。

### 3.8 Downloads 模块

Downloads 负责资源获取。

职责：

- 从 comic_resource 创建 download_task
- 管理下载任务状态
- 调用 provider 添加任务
- 轮询任务
- OpenList 离线提交若返回任务已存在（10008），入队云端库恢复：对扁平库根（默认 `/115Open/HENTAI/exhentai`）做单飞分页索引扫描（TTL 内复用），批量匹配 zip/cbz 后创建 transfer，而不是重复提交磁链
- 获取下载链接
- 下载到临时文件（内置 HTTP / 非 aria2 流式路径）
- aria2 下载直接写入入库目录（默认下载目录或 manga root/下载入库），完成后不再迁移文件，保证 aria2 日志路径仍可打开
- 完成后移动到 manga root
- 触发 Library / Local Files 重新扫描
- 支持 `media_type=video` 的下载任务，默认使用 aria2，完成后触发 video-library 扫描；未来 Metadata Ingest 可以创建视频资源，但本次不开发插件端。

OpenList、115、内置 HTTP 下载、aria2 都应该是 Downloads 的 provider adapter。

OpenList 登录、OpenList token、115 离线任务、云端目录扫描都属于 Downloads 或它的 provider 子模块，不属于 Metadata Ingest。

下载决策：

- Downloads 只消费 `comic_resource`，不直接理解标签和漫画展示规则。
- 下载完成后触发 Local Files / Library 重新扫描；aria2 直写入库时只登记 finalPath 并扫描，不移动文件。
- 下载目标默认是 `manga root/下载入库/标题/`，后台允许修改目标目录。
- 视频下载目标默认是 `video root/下载入库/标题/`，后台允许修改目标目录。
- 下载任务失败默认手动重试，自动重试次数后续可配置。

### 3.9 Admin 模块

Admin 是管理界面和管理 API 的组合层。

职责：

- 漫画管理
- 文件维护
- 标签管理
- 系统设置
- 任务查看
- 缺失文件和重复候选确认

Admin 页面可以调用各业务模块，但不要把业务规则写进 Admin。

### 3.10 Search 模块

Search 可以晚一点做成独立模块。

第一阶段可以先用数据库查询实现。

后续职责：

- 标题搜索
- 作者搜索
- 标签筛选
- 状态筛选
- 阅读状态筛选
- 排序

### 3.11 Collections 模块

Collections 是后续阅读组织模块。

第一阶段不做。

后续职责：

- 收藏分类
- 阅读队列
- 连续阅读当前分类
- 自动下一本
- 队列快照

不建议第一阶段把它命名为 Favorite，因为后续它不只表达收藏，还会表达阅读队列和专题集合。

### 3.12 Browser Extension App

浏览器插件是独立 app。

它不是 web app 的模块，因为它运行环境、权限、打包方式都不同。

它只通过 HTTP API 和本地服务通信。

## 4. 目录结构

推荐使用折中目录：保留上面的模块边界，同时吸收更具体的 Next.js 路由分组、worker、script、component 目录。

```text
apps/
  web/
    src/
      app/
        (site)/
          page.tsx
          comics/
            page.tsx
            [id]/
              page.tsx
          videos/
            page.tsx
            [id]/
              page.tsx
          reader/
            [comicId]/
              page.tsx
          collections/
            [collectionId]/
              page.tsx
        admin/
          page.tsx
          comics/
            page.tsx
          videos/
            page.tsx
          files/
            page.tsx
          tags/
            page.tsx
          downloads/
            page.tsx
          settings/
            page.tsx
        api/
          metadata/
            import/
              route.ts
          comics/
            route.ts
            [id]/
              route.ts
          reader/
            [comicId]/
              route.ts
          pages/
            [pageId]/
              route.ts
          videos/
            route.ts
            [id]/
              route.ts
              stream/
                route.ts
              open-potplayer/
                route.ts
          video-progress/
            route.ts
          tags/
            route.ts
          local-files/
            scan/
              route.ts
          downloads/
            route.ts
            [id]/
              retry/
                route.ts
          providers/
            openlist/
              test/
                route.ts
        layout.tsx
        globals.css
      modules/
        core/
          config.ts
          db.ts
          errors.ts
          logger.ts
          events.ts
          settings.ts
        library/
          domain/
          application/
          infrastructure/
          ui/
        video-library/
          domain/
          application/
          infrastructure/
          ui/
        local-files/
          domain/
          application/
          infrastructure/
        media-assets/
          domain/
          application/
          infrastructure/
        tags/
          domain/
          application/
          infrastructure/
        reader/
          domain/
          application/
          infrastructure/
        metadata-ingest/
          domain/
          application/
          infrastructure/
          api/
        downloads/
          domain/
          application/
          infrastructure/
          providers/
            openlist/
            builtin-http/
            aria2/
        admin/
          ui/
          application/
        search/
          application/
        collections/
          domain/
          application/
          infrastructure/
      server/
        container.ts
        repositories.ts
        response.ts
        auth.ts
      workers/
        local-scan.worker.ts
        download.worker.ts
        cloud-scan.worker.ts
      components/
        ui/
        comic/
        reader/
        admin/
      styles/
      lib/
        path.ts
        file.ts
        hash.ts
        utils.ts
  extension/
    src/
      content/
      popup/
      background/
      site-adapters/
  prototype/
    src/
packages/
  shared/
    src/
      ids.ts
      result.ts
      tags.ts
      api-contracts.ts
  ui/
  mock-data/
scripts/
  scan-local.ts
  seed.ts
  test-openlist.ts
docs/
  plan.md
```

模块内部建议：

```text
domain/          纯业务类型和规则，不依赖 Next.js
application/     用例服务，例如 scanLibrary、importMetadata、createDownloadTask
infrastructure/  数据库、文件系统、外部 provider adapter
ui/              该模块专用 React 组件
api/             该模块专用请求解析和响应 DTO
```

目录边界说明：

- `app/(site)` 是漫画网站前台，不放管理逻辑。
- `app/admin` 是后台入口，只做管理编排和展示。
- `app/api` 只负责请求解析、鉴权、调用模块 service、返回响应。
- `modules/library` 是本地漫画库模块，不再额外建立平级 `comic` 模块；`comic` 是核心实体名，不是独立业务边界。
- `modules/video-library` 是本地视频库模块；视频集数是可播放文件实体，不复用漫画的 `chapter`/`page`。
- `modules/metadata-ingest` 不命名为 `import`，避免和本地扫描入库混淆。
- `modules/downloads/providers/openlist` 是 provider adapter，不建立平级 `modules/openlist`。
- `modules/media-assets` 比单独 `thumbnail` 更宽，既覆盖封面，也覆盖 reader 缩略图。
- `modules/collections` 先预留，不进入 MVP。
- `workers` 只承载后台任务入口，业务逻辑仍调用对应 module service。
- `scripts` 用于开发、维护和一次性任务，不承载线上业务规则。
- 不使用 `prisma/`，数据库 schema 按 Drizzle 放在 core 或各模块 infrastructure 中。
- 不把真实漫画库固定放在项目内的 `storage/manga`；manga root 必须是用户配置的绝对路径。
- 应用生成的缓存、缩略图、临时文件可以放在配置化的 `.data` 目录或用户指定目录。

## 5. 数据模型草案

第一阶段先设计最小但可扩展的 schema，避免后续从单 root、单文件、单章节强行迁移。

首批表：

- `settings`：系统设置，例如监听地址、缓存目录、缓存上限、阅读偏好。
- `manga_roots`：漫画根目录，保存绝对路径、启用状态、预留 `scan_mode`。
- `video_roots`：视频根目录，保存绝对路径、启用状态和扫描模式。
- `scan_sessions`：扫描批次，保存开始时间、结束时间、root、统计结果、错误摘要。
- `comics`：漫画业务实体，保存展示标题、文件标题、原始标题、元数据查询标题、排序标题、状态、主 `local_file`、last_read 快照。
- `local_files`：本地文件实体，保存 root、路径、类型、size、mtime、可选 hash、是否主文件、缺失状态。
- `chapters`：章节实体，保存 comic 归属、可选标题、排序值、来源 local_file。
- `pages`：页面实体，保存 chapter 归属、页码、page source、宽高、读取状态。
- `tags`：canonical 标签，保存 namespace、name、中文翻译、别名信息。
- `comic_tags`：comic 与 tag 关系。
- `chapter_tags`：预留章节标签关系，MVP 可以不开放 UI。
- `reading_progress`：阅读进度，保存 comic、chapter、page、百分比、更新时间。
- `comic_sources`：来源站元数据，保存站点、来源 ID、URL、原始标题、封面 URL。
- `comic_resources`：可下载资源，保存资源类型、脱敏展示字段、完整资源链接密文或受控字段。
- `videos`：视频业务实体，保存标题、状态、last-watched 快照和本地集数关系。
- `video_episodes`：视频集数和可播放文件，保存视频归属、标题、路径、自然/手动排序、时长秒数、文件状态。
- `video_tags`：视频与全局 `tags` 的关联，支持 manual/metadata 来源和用户编辑保护。
- `video_progress`：视频集数播放进度，保存视频、集数、当前秒数、百分比、完成状态和更新时间。
- `video_sources` / `video_resources`：预留未来插件 metadata 和资源导入，结构与 comic source/resource 解耦但采用相同规范化规则。
- `download_tasks`：下载任务，第四阶段启用。
- `media_assets`：生成的封面和缩略图记录，保存用途类型、尺寸、key、路径、lastAccess、过期时间。
- `cache_entries`：压缩包文件列表、最近访问页面等缓存记录。
- `operation_logs`：操作审计日志，记录软删除、路径修复、合并章节、切换主文件，以及下载任务创建、取消、重试等生命周期事件。

关键关系：

```text
manga_root 1 ── * local_file
comic      1 ── * local_file
comic      1 ── * chapter
chapter    1 ── * page
comic      * ── * tag
chapter    * ── * tag   (reserved)
comic      1 ── * comic_source
comic      1 ── * comic_resource
comic      1 ── * reading_progress
video_root 1 ── * video_episode
video      1 ── * video_episode
video      * ── * tag
video      1 ── * video_progress
```

数据安全要求：

- `page` 对外只暴露 `pageId`，不得暴露可拼接读取的真实路径。
- `comic_resource` 可以保存完整资源链接，但日志和常规 UI 必须脱敏。
- `operation_logs` 不记录完整 magnet。
- manga root 必须是绝对路径，且不得默默自动创建父目录。
- video root 必须是绝对路径；视频播放、首帧和 PotPlayer 启动 API 只接受受控的 `videoId`/`episodeId`，不接受客户端任意路径。

## 6. 模块交互示例

### 6.1 本地扫描

```text
Admin 点击扫描
  ↓
Library application: scanLibraryRoot()
  ↓
Local Files: enumerate local entries
  ↓
Library: create comic/chapter/page records
  ↓
Tags: attach basic tags if present
  ↓
Admin 展示扫描结果
```

### 6.4 视频扫描与播放

```text
Admin 点击扫描 video root
  ↓
video-library application: scanVideoRoot()
  ↓
Local Files: enumerate supported files and child directories
  ↓
video-library: create videos/video_episodes and extract file facts
  ↓
Media Assets: lazily generate first-frame cover
  ↓
Video detail: select episode without autoplay
  ↓
Video Player: stream by episodeId and throttle-save seconds progress
```

### 6.2 插件导入 metadata

```text
Extension 采集页面
  ↓
POST /api/import
  ↓
Metadata Ingest: validate token and normalize payload
  ↓
Tags: upsert canonical tags
  ↓
Library: create/update comic
  ↓
Metadata Ingest: create comic_source and comic_resource
  ↓
返回导入结果和可下载资源状态
```

### 6.3 下载

```text
用户选择资源下载
  ↓
Downloads: create download_task from comic_resource
  ↓
OpenList provider: add offline task / fetch link
  ↓
Downloads: write temporary file
  ↓
Local Files: finalize file path
  ↓
Library: scan finalized file
  ↓
Reader 可以读取页面
```

## 7. 第一阶段 MVP

第一阶段目标：

```text
手动放入本地漫画文件后，系统可以扫描、入库、展示、阅读，并保存阅读进度。
```

第一阶段只做：

- Next.js 本地自托管 web app
- SQLite + Drizzle
- 一个或多个 manga root 绝对路径设置
- 普通目录 / zip / cbz 扫描
- 手动扫描和 scan_session 结果记录
- 漫画列表
- 漫画详情
- 垂直阅读器
- 阅读进度保存
- 方向键、空格、Home、End 基础快捷键
- 桌面缩略图侧边栏和移动端手动打开
- 压缩包文件列表缓存和按需页面抽取
- reader 缩略图懒生成、占位、缓存命中秒显、后台队列补图
- 缓存目录、缓存大小上限、过期时间、LRU 清理
- 基础标签存储和展示
- 基础搜索和筛选
- 后台文件维护
- 缺失文件检测和路径修复提示
- 软删除 / 隐藏记录
- 手动 SQLite 备份导出
- 危险操作简单日志
- 后台首页展示扫描状态、缺失文件、疑似重复、最近危险操作、存储和缓存状态
- 设置页包含 manga root、监听地址、缓存目录、缓存上限、备份导出、主题和阅读偏好

视频功能作为当前视频扩展阶段纳入 MVP：

- 一个或多个 video root 绝对路径设置和手动扫描
- 支持单文件单集、子目录多集视频
- 支持 `.mp4`、`.mkv`、`.avi`、`.mov`、`.webm`、`.m4v`、`.ts`
- 视频列表、搜索、标签筛选、详情和原生 video 播放
- 首帧封面懒生成和缓存
- 视频时长秒数、文件大小、格式展示
- 集数自然排序和后台手动排序
- 秒级播放进度、继续观看和已看状态
- 视频管理、缺失检查、路径修复、隐藏/恢复、软删除和标题/标签编辑
- 下载任务“视频下载”分类，后台直链创建，aria2 默认 provider，完成后扫描入库
- PotPlayer 可执行文件路径设置、服务端启动按钮和 `potplayer://` 协议按钮

第一阶段不做：

- 浏览器插件
- OpenList / 115 下载
- aria2
- 磁链下载
- 云端目录扫描
- 下载任务中心
- 收藏分类连续阅读队列
- 文件监听
- 物理删除文件
- 多用户系统
- 启动时自动扫描
- 列表页批量插件采集
- rar / cbr / 7z / pdf
- 视频浏览器插件采集；仅保留未来 Metadata Ingest 的后端扩展位
- 视频自动播放和自动切换下一集
- 视频压缩包扫描

## 8. 第二阶段

数据库和后台维护完善：

- 编辑 display_title
- 保留 file_title 不变
- 编辑 original_title / metadata_query_title
- 编辑 `artist:*`、`group:*` 等作者相关标签
- 编辑标签
- 标签翻译表
- 手动上传封面
- 重新扫描
- 重新生成封面
- 重复候选处理
- 软删除和恢复

## 9. 第三阶段

浏览器插件和 Metadata Ingest：

- Chrome Manifest V3 extension
- 站点 adapter
- 读取来源站标题、作者、标签、封面、URL、站点 ID
- 读取磁链 / 种子资源
- 提交本地服务
- 与已有本地漫画匹配
- 重复导入策略
- 第一版插件只提交详情页，不做列表页批量采集
- 允许只提交 metadata，不提交可下载资源

## 10. 第四阶段

Downloads 和 OpenList provider：

- provider adapter 注册表和 worker 调度预检骨架
- OpenList 连接设置
- OpenList 只读连接校验
- OpenList 登录或 token 管理
- 115 离线任务
- 云端目录扫描
- 获取下载链接
- 本地临时文件下载
- 下载完成后扫描入库
- provider 边界预留 aria2 / builtin HTTP

## 11. 第五阶段

阅读体验增强：

- 收藏分类
- 阅读队列快照
- 自动下一话
- 自动下一本
- 跨章节 / 跨漫画分隔条
- 继续阅读当前队列

## 12. 安全边界

- 不提交真实 token、cookie、OpenList 凭据、磁链、私有来源 URL。
- mock 数据必须使用 mock 路径和 mock 元数据。
- 日志不得输出完整 magnet link。
- 删除 comic record 不删除真实文件。
- 物理删除文件必须单独确认绝对路径。
- 插件写接口至少需要本地 token。
- MVP 不做完整登录系统。

## 13. 当前开发状态

截至 2026-07-09，`apps/web` 已经从原型参照进入正式 MVP 实现收尾阶段。第一阶段 MVP 的主体能力已经基本落地：

- Next.js 本地自托管 web app
- SQLite + Drizzle 数据模型和启动初始化
- manga root 绝对路径设置、创建后手动扫描
- 目录 / zip / cbz 扫描入库
- comic、local_file、chapter、page 基础记录
- scan_session 结果记录
- 前台漫画列表、搜索、标签筛选、详情页
- 垂直 reader、页面图片 API、阅读进度保存
- reader 快捷键、缩略图侧边栏、沉浸式相关偏好
- archive 文件列表缓存和按需页面读取
- 封面、列表缩略图、reader 缩略图和缓存清理
- 基础标签存储、中文展示、手动绑定
- 后台首页、漫画管理、文件维护、标签、设置
- 缺失文件检测、重新检查、忽略缺失项、路径修复、隐藏 / 软删除 / 恢复
- 前台详情页可跳转到独立后台漫画信息页，集中维护标题、封面、标签、章节和合并关系
- SQLite 备份导出
- 危险操作日志

当前重点不再是从 `apps/prototype` 迁移页面，而是稳定 `apps/web`：

- 修复测试和真实使用中暴露的 MVP 边缘问题
- 补齐必要的空状态、错误提示和操作反馈
- 避免设置页暴露不可保存的假控件；MVP 固定策略用只读状态展示
- 后台管理入口从前台打开时默认使用浏览器新标签页，后台内部提供类似浏览器的应用页签工作台
- 后台应用页签需要缓存已打开页签，并尽量保留页签切换时的页面交互状态
- 后续阶段启动点：优先打通 Chrome MV3 插件采集详情页 metadata、状态查询、提交入库和 remote-only / 本地匹配闭环
- 校准前台漫画网站体验与后台管理入口的主次关系
- 对扫描、reader、缓存、文件维护和备份做端到端验证
- 保持文档与真实实现同步

部分后续阶段能力已经提前进入 `apps/web`：

- 第二阶段的一部分：标题 / 元数据编辑、标签维护、封面上传 / 重新生成、重复候选、合并为章节和恢复
- 第三阶段的一部分：Chrome MV3 插件 ExHentai 详情页采集、torrent 页面资源采集、浏览器登录态种子转磁链、`metadata-ingest`、导入 token、来源站状态检查、metadata 导入、remote-only 记录和显式本地匹配提交
- 第四阶段的一部分：Downloads provider 注册、OpenList 连接检查、OpenList cloud scan、资源导入、下载准备、临时下载、finalization
- 第五阶段的一部分：collections / reading queue 和队列阅读导航

`apps/prototype` 现在保留为交互和视觉参考，不再代表项目主阶段。`apps/web` 继续实现或调整对应页面时，仍应参照 `apps/prototype` 已验证的视觉密度、导航结构、页面布局和交互手感。

`apps/prototype` 同时是已验证 UI 依赖栈的参考。当前原型使用 Next.js App Router、TypeScript、Tailwind CSS、Mantine、shadcn/ui 和 lucide-react；其中 Mantine (`@mantine/core`, `@mantine/hooks`) 是原型页面中按钮、输入、选择器、开关、弹窗、tabs 等控件的主要实现来源。

`apps/web` 实现与原型对应的页面或工作流时，应安装并使用这些原型 UI 依赖，优先复用 Mantine 和原型中的 `AppButton`、`AppInput`、`AppSelect`、`AppSwitch`、`AppModal`、`AppTabs` 等组件方式。shadcn/ui 可以保留为已有组件或低层 primitives，但不能在已有 Mantine 原型的页面上用另一套视觉系统近似替代，除非计划先记录原因。

原型只保留 mock 数据和 mock 状态，不得迁移到 `apps/web` 作为真实业务实现。
