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

- 扫描配置好的漫画根目录
- 识别目录、zip、cbz
- 创建 comic、local_file、chapter、page 基础记录
- 提供漫画列表、详情页、基础搜索和标签筛选所需数据
- 提供缺封面、缺文件、未阅读、阅读中等展示状态

Library 不关心漫画元数据从哪里来，也不关心下载怎么发生。

它只关心：当前本地库里有什么漫画，能不能展示和阅读。

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

### 3.5 Local Files 模块

Local Files 负责磁盘事实和文件维护。

职责：

- 管理 manga root
- 检查本地路径是否存在
- 检测缺失文件
- 检测文件变更
- 修复 local_file 路径
- 生成或重新生成封面、缩略图
- 计算基础文件信息

Library 可以调用 Local Files 的扫描结果，但不要把所有文件维护逻辑塞进 Library。

### 3.6 Metadata Ingest 模块

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

### 3.7 Downloads 模块

Downloads 负责资源获取。

职责：

- 从 comic_resource 创建 download_task
- 管理下载任务状态
- 调用 provider 添加任务
- 轮询任务
- 获取下载链接
- 下载到临时文件
- 完成后移动到 manga root
- 触发 Library / Local Files 重新扫描

OpenList、115、内置 HTTP 下载、aria2 都应该是 Downloads 的 provider adapter。

OpenList 登录、OpenList token、115 离线任务、云端目录扫描都属于 Downloads 或它的 provider 子模块，不属于 Metadata Ingest。

### 3.8 Admin 模块

Admin 是管理界面和管理 API 的组合层。

职责：

- 漫画管理
- 文件维护
- 标签管理
- 系统设置
- 任务查看
- 缺失文件和重复候选确认

Admin 页面可以调用各业务模块，但不要把业务规则写进 Admin。

### 3.9 Search 模块

Search 可以晚一点做成独立模块。

第一阶段可以先用数据库查询实现。

后续职责：

- 标题搜索
- 作者搜索
- 标签筛选
- 状态筛选
- 阅读状态筛选
- 排序

### 3.10 Browser Extension App

浏览器插件是独立 app。

它不是 web app 的模块，因为它运行环境、权限、打包方式都不同。

它只通过 HTTP API 和本地服务通信。

## 4. 目录结构

推荐目录：

```text
apps/
  web/
    src/
      app/
        page.tsx
        comics/[id]/page.tsx
        reader/[id]/page.tsx
        admin/page.tsx
        api/
          import/route.ts
          downloads/route.ts
          reader/[comicId]/route.ts
          pages/[pageId]/route.ts
      modules/
        core/
          config.ts
          db.ts
          errors.ts
          logger.ts
          events.ts
        library/
          domain/
          application/
          infrastructure/
          ui/
        local-files/
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
      server/
        container.ts
        repositories.ts
      components/
      styles/
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

## 5. 模块交互示例

### 5.1 本地扫描

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

### 5.2 插件导入 metadata

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

### 5.3 下载

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

## 6. 第一阶段 MVP

第一阶段目标：

```text
手动放入本地漫画文件后，系统可以扫描、入库、展示、阅读，并保存阅读进度。
```

第一阶段只做：

- Next.js 本地自托管 web app
- SQLite + Drizzle
- manga root 绝对路径设置
- 普通目录 / zip / cbz 扫描
- 漫画列表
- 漫画详情
- 垂直阅读器
- 阅读进度保存
- 基础标签存储和展示
- 基础搜索和筛选
- 后台文件维护
- 缺失文件检测和路径修复提示

第一阶段不做：

- 浏览器插件
- OpenList / 115 下载
- aria2
- 磁链下载
- 云端目录扫描
- 下载任务中心
- 收藏分类连续阅读队列
- rar / cbr / 7z / pdf

## 7. 第二阶段

数据库和后台维护完善：

- 编辑 display_title
- 保留 file_title 不变
- 编辑 original_title / metadata_query_title
- 编辑作者
- 编辑标签
- 标签翻译表
- 手动上传封面
- 重新扫描
- 重新生成封面
- 重复候选处理
- 软删除和恢复

## 8. 第三阶段

浏览器插件和 Metadata Ingest：

- Chrome Manifest V3 extension
- 站点 adapter
- 读取来源站标题、作者、标签、封面、URL、站点 ID
- 读取磁链 / 种子资源
- 提交本地服务
- 与已有本地漫画匹配
- 重复导入策略

## 9. 第四阶段

Downloads 和 OpenList provider：

- OpenList 连接设置
- OpenList 登录或 token 管理
- 115 离线任务
- 云端目录扫描
- 获取下载链接
- 本地临时文件下载
- 下载完成后扫描入库
- provider 边界预留 aria2 / builtin HTTP

## 10. 第五阶段

阅读体验增强：

- 收藏分类
- 阅读队列快照
- 自动下一话
- 自动下一本
- 跨章节 / 跨漫画分隔条
- 继续阅读当前队列

## 11. 安全边界

- 不提交真实 token、cookie、OpenList 凭据、磁链、私有来源 URL。
- mock 数据必须使用 mock 路径和 mock 元数据。
- 日志不得输出完整 magnet link。
- 删除 comic record 不删除真实文件。
- 物理删除文件必须单独确认绝对路径。
- 插件写接口至少需要本地 token。
- MVP 不做完整登录系统。

## 12. 当前原型状态

`apps/prototype` 用于验证关键交互：

- 首页漫画列表、搜索、标签筛选、分页
- 漫画详情页和章节列表
- reader 垂直阅读、缩略图导航、图钉返回顶部
- admin 文件维护、漫画管理、标签管理、设置

原型只保留 mock 数据和 mock 状态，不得迁移到 `apps/web` 作为真实业务实现。
