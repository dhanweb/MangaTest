# MangaTest 项目功能总览

本文档汇总 MangaTest 当前仓库中的实际功能、使用入口、模块边界和未实现范围。内容以当前代码为依据，`docs/plan.md` 仍是产品范围、架构决策和开发阶段的唯一来源。

最后核对日期：2026-07-19。

## 1. 状态说明

本文使用以下状态区分实现程度：

- **已实现**：`apps/web` 或 `apps/extension` 中已有真实代码，可以连接本地数据库、文件系统或外部服务执行。
- **受条件限制**：代码已经实现，但需要 OpenList、aria2、浏览器登录态或保持下载管理页打开等外部条件。
- **仅原型**：只存在于 `apps/prototype` 或 `prototypes/visual-html`，使用 mock 数据，不代表正式功能。
- **未实现**：没有可用实现，仍属于计划或明确延期范围。

## 2. 项目定位与组成

MangaTest 是一个本地自托管的个人漫画库系统。核心流程是把本地目录、ZIP 和 CBZ 漫画扫描入库，然后提供网站式浏览、详情、搜索和纵向阅读体验；浏览器扩展、元数据导入和下载模块用于补充来源信息与获取资源。

| 组成 | 状态 | 用途 |
| --- | --- | --- |
| `apps/web` | 已实现，当前主应用 | Next.js 全栈应用，包含前台、后台、SQLite 数据、文件扫描、阅读器、元数据和下载能力 |
| `apps/extension` | 已实现，版本 `0.3.2` | Chrome Manifest V3 扩展，采集来源站详情、转换种子为磁链并提交到本地服务 |
| `apps/prototype` | 仅原型 | 使用 mock 数据验证前台、阅读器和后台页面的布局与交互 |
| `prototypes/visual-html` | 仅原型 | 更早期的静态 HTML 视觉参考 |
| `scripts` | 开发维护工具 | OpenList、漫画根目录和下载任务的本地诊断脚本，不是产品 UI |

正式 Web 应用使用 Next.js App Router、TypeScript、React、Tailwind CSS、Mantine、shadcn/ui、SQLite、Drizzle ORM、Sharp、Yauzl 和 Vitest。默认开发地址为 `http://127.0.0.1:4317`。

## 3. 用户入口

### 3.1 前台

| 页面 | 地址 | 功能 |
| --- | --- | --- |
| 漫画库首页 | `/` | 浏览、搜索、标签筛选、排序、分页和继续阅读 |
| 漫画详情 | `/comics/[id]` | 查看封面、标签、章节、页数和开始/继续阅读 |
| 阅读器 | `/reader/[id]` | 纵向阅读、章节分隔、缩略图导航、快捷键和进度保存 |
| 收藏与队列 | `/collections` | 查看收藏分类和阅读队列 |
| 收藏/队列详情 | `/collections/[id]` | 查看集合中的可读漫画，并从队列第一本开始阅读 |

### 3.2 后台

| 页面 | 地址 | 功能 |
| --- | --- | --- |
| 后台首页 | `/admin` | 漫画、缺失文件、重复候选、扫描、缓存和操作日志概览 |
| 漫画路径 | `/admin/paths` | 管理漫画根目录、启停扫描、手动扫描、打开文件夹和迁移系统根目录 |
| 漫画管理 | `/admin/comics` | 按标题或状态查找全部漫画记录 |
| 漫画维护详情 | `/admin/comics/[id]` | 编辑元数据、标签、封面、章节顺序、合并关系和记录状态 |
| 文件维护 | `/admin/files` | 检查缺失文件、修复路径、忽略问题和处理重复候选 |
| 标签管理 | `/admin/tags` | 搜索、新建、编辑和删除未绑定标签 |
| 收藏与队列 | `/admin/collections` | 创建、编辑、启停和删除收藏或阅读队列 |
| 下载任务 | `/admin/downloads` | 管理离线任务、传输任务、资源、worker、重试、取消和拉回本地 |
| 设置 | `/admin/settings` | 阅读、缓存、导入 token、下载、OpenList、aria2、备份和数据清理 |

后台采用应用内页签工作台。内部导航会复用已有页签，页签状态保存到浏览器存储；支持刷新当前页签、关闭、关闭其他、关闭右侧和关闭全部，并缓存已打开页面以尽量保留切换前的交互状态。前台进入后台时默认打开浏览器新标签页。

## 4. 已实现功能参考

### 4.1 本地漫画库

- 支持配置多个绝对路径漫画根目录，并可启用或停用单个根目录。
- 首次启动会使用项目下的 `manga_store` 作为系统默认根目录；系统根目录和用户根目录在数据中有明确类型区分。
- 新建漫画根目录后会立即触发一次扫描，也可以在后台手动扫描单个根目录或全部已启用根目录。
- 默认扫描模式把根目录下的每个直接子目录、`.zip` 或 `.cbz` 文件视为一本漫画。
- 扫描会创建或更新 `comic`、`local_file`、`chapter`、`page` 和 `scan_session` 记录。
- 扫描会按规范化标题复用已有的 `readable`、`missing_local_file` 或 `remote_only` 记录；metadata 先导入、ZIP/目录后扫描时会回绑到同一 comic，不会重复创建漫画。
- 对历史上同标题且仅有一个本地文件、没有来源/资源/标签/阅读进度的简单重复记录，重新扫描会在不移动物理文件的前提下回绑本地文件，并软删除空的重复记录；带有独立元数据或多文件/多章节的复杂重复仍保留在“重复候选”中供后台处理。
- 目录漫画直接枚举图片；ZIP/CBZ 只缓存文件列表，阅读时按需提取单页，不默认完整解压。
- 扫描会记录新增、缺失、重复候选、可恢复数量和错误摘要。
- 重新扫描会标记消失的本地文件；文件重新出现时会清除缺失标记。
- `下载入库` 是下载专用目录。普通库扫描不会把它本身当作漫画，前台和后台漫画列表也会过滤同名占位记录。
- 前台默认只展示状态为可读、主本地文件存在且未缺失的漫画；缺失、隐藏、删除和 remote-only 记录只在后台出现。
- 一本漫画的数据模型支持多个本地文件，并保存主本地文件标识；当前阅读器使用主本地文件对应页面。

### 4.2 搜索、浏览与漫画详情

- 首页搜索会匹配展示标题、文件标题、原始标题、元数据查询标题和已绑定标签文本。
- 支持 canonical 标签筛选，并在首页提供常用标签快捷入口。
- 支持按最近更新、标题和页数排序。
- 支持分页，并保留搜索、标签和排序查询参数。
- 漫画卡片显示封面、章节/页数、标签和继续阅读入口。
- 漫画详情展示封面、标题、标签、页数、章节列表和每章阅读入口。
- 前台详情页不展示完整本地路径；维护入口会打开独立后台漫画详情页。

### 4.3 阅读器

- 通过漫画 ID 加载阅读数据，以纵向长页方式渲染漫画。
- 页面图像只通过 `/api/pages/[pageId]` 读取，客户端不能传入任意文件系统路径。
- 同一接口支持目录、ZIP 和 CBZ 页面。
- 阅读进度按漫画、章节、页面和百分比保存，同时更新漫画级最后阅读快照。
- 再次进入漫画时可继续到上次阅读位置。
- 支持图片预加载，并可配置是否启用和向后预加载页数。
- 支持桌面缩略图侧栏；缩略图通过 page ID 懒生成，可点击跳页。
- 支持沉浸模式，隐藏不必要的阅读器工具栏。
- 多章节漫画会在章节切换处显示分隔条。
- 从启用的阅读队列进入时，阅读器显示队列位置，并在末尾提供下一本入口。
- 快捷键：`Up/W` 向上滚动，`Down/S` 向下滚动，`Space` 向下翻动，`Shift+Space` 向上翻动，`Home` 到开头，`End` 到末尾，`T` 切换缩略图，`Esc` 退出沉浸或关闭缩略图。

### 4.4 封面、缩略图与缓存

- 漫画封面通过安全的 comic ID API 提供，不暴露实际图片路径。
- 可从本地漫画第一页生成封面；无法生成时使用稳定的占位封面。来源站封面 URL 会保存为元数据，但当前不会直接用于正式封面生成。
- 后台支持手动上传封面，手动封面的优先级高于生成封面。
- 后台支持清除并重新生成可读漫画的封面缓存。
- 列表缩略图和 reader 缩略图由 Sharp 生成。
- 缩略图缓存键包含来源身份、用途和请求尺寸，缓存命中会更新 `lastAccess`。
- 压缩包文件列表和页面图像缓存有独立记录。
- 缓存清理同时考虑容量上限和过期时间；后台可查看缓存总量、过期数量和最早访问时间。

### 4.5 标签

- 标签由 `namespace`、`name` 和唯一 `canonical` 值组成，可保存中文显示名和别名 JSON。
- 作者和社团作为普通标签处理，例如 `artist:*`、`group:*`，没有单独作者表。
- 内置常见 namespace 的中文分类名称，同时允许其他 namespace。
- 标签管理页支持按名称、翻译和分类搜索。
- 可新建和编辑标签；已绑定漫画的标签不能直接删除。
- 后台漫画详情可添加或移除标签。
- 标签绑定记录来源为扫描、元数据或手动，并标记用户编辑，后续导入不会覆盖手动标签选择。

### 4.6 漫画后台维护

- 漫画管理页可搜索并筛选可读、缺失、隐藏、删除和 remote-only 状态。
- 可编辑 `display_title`、`original_title` 和 `metadata_query_title`，同时保留扫描得到的 `file_title`。
- 可查看本地文件、来源站记录、下载资源、阅读进度和该漫画相关操作日志。
- 可调整章节顺序并持久化 `sort_order`。
- 可把一本可读的单章节漫画合并为另一本漫画的章节，也可以恢复为独立漫画。
- 合并和恢复只改数据库关系，不移动、复制或删除物理文件。
- 可隐藏、软删除和恢复漫画记录；这些操作不会删除真实文件。
- 可重新生成或上传封面，并管理漫画标签。

### 4.7 本地文件与路径维护

- 后台列出缺失本地文件，并可重新检查磁盘状态。
- 路径修复只更新数据库中的路径，不移动真实文件。
- 可忽略单个缺失文件问题，忽略操作不会改变漫画可见状态，也不会触碰真实文件。
- 重复候选按规范化标题分组，可隐藏或软删除候选漫画记录。
- 可以通过操作系统默认文件管理器打开漫画根目录或已完成下载的位置，兼容 Windows、macOS 和 Linux 的打开方式。
- 系统默认 manga root 可以修改绝对路径。用户需要明确选择“移动文件”或“只改数据库路径”。
- 物理迁移会拒绝相同路径、源目录内部的目标路径和非空目标目录；成功后同步改写本地文件和下载最终路径。
- 用户创建的 manga root 当前只能修改描述和启用状态，不能通过该入口迁移绝对路径。

### 4.8 元数据导入

- `/api/metadata/status` 可按站点、来源 ID/URL 和标题查询当前页面是否已导入、是否存在唯一标题匹配、是否有本地文件以及是否可读。
- `/api/metadata/import` 接受 Bearer token 或 `x-mangatest-import-token` 保护的详情页元数据。
- 导入可明确指定已有漫画；未指定时先复用相同来源，再尝试唯一的规范化标题匹配。
- 没有本地匹配时会创建 remote-only 漫画，不进入普通首页。
- 导入保存来源站、来源 ID、URL、原始标题、封面、规范化标签和资源记录。
- 资源支持 `magnet`、`torrent`、`http` 和 `openlist` 类型；常规列表与操作日志使用脱敏表示。
- 重复导入同一来源会更新已有记录，不重复创建漫画。
- 导入不会覆盖用户修改的展示标题或手动标签绑定。
- `/api/metadata/import-with-magnet` 在导入元数据后，为磁链资源创建 OpenList 离线任务并立即尝试提交一次。

### 4.9 Chrome 浏览器扩展

- 扩展采用 Manifest V3，可直接从 `apps/extension` 以 unpacked 方式加载，日常开发不需要先打包。
- popup 显示扩展版本，保存本地服务地址、导入令牌、详情页自动下载开关和自动提交种子数量（1 到 10）。
- 支持 ExHentai/e-hentai 详情页、torrent 页面和 nhentai 详情页适配器，并保留通用元数据采集器作为结构解析后备。
- 详情页可采集标题、原始标题、封面、来源 ID/URL、namespace 标签和中文标签文本。
- ExHentai 详情页注入固定库状态提示和操作面板，可单独提交元数据或启动下载流程。
- 库状态会区分已入库可读、已导入但无本地文件、缺失和未入库；已本地可读的漫画不会自动重复下载。
- 启用自动下载后，打开详情页会缓存该画廊元数据、打开对应 torrent 页面并进入受控自动提交流程。
- torrent 页面会复用详情页缓存的标题和标签，抓取登录态可访问的 `.torrent`，在扩展后台解析 bencode 并转换为 BTIH magnet。
- 自动流程只处理配置数量的种子，提交成功后关闭 torrent 标签页，并把结果通知回详情页显示。
- 手动打开 torrent 页面不会无条件批量自动提交，避免浏览时误触发下载。
- 所有对本地服务的写请求由扩展 service worker 统一附加导入 token。
- 扩展检查脚本覆盖 manifest、文件引用、通用页面、nhentai、ExHentai 详情、torrent 采集和 torrent-to-magnet 转换。

### 4.10 下载与资源获取

下载模块区分两类任务：`offline` 负责把磁链提交到 OpenList/115，`transfer` 负责把远端或直接资源传输到本地。

- 下载管理页分别展示离线任务和传输任务的排队、处理中、完成和失败状态。
- 可从 `comic_resource` 创建任务，并根据资源类型选择默认 provider：磁链/torrent 默认 aria2，HTTP 默认 builtin HTTP，OpenList 路径默认 OpenList。
- 会校验资源和 provider 的兼容性；同资源、同 provider 的排队或运行任务会被复用。
- 创建和重试会立即尝试 dispatch，不必等待下一次手动 worker tick。
- 支持取消、重新排队、删除任务和打开已完成文件位置。
- 管理页打开时会定时运行 offline 和 transfer worker，也可以手动触发一次。
- 任务详情显示任务类型、provider、状态、完整错误、重试次数、远程任务/路径、目标目录、来源站和资源信息。
- 创建、取消、重试和拉回操作写入操作日志；日志不保存完整 magnet。删除任务会同时删除该任务的 preparation、transfer、finalization 和关联操作日志。

#### OpenList 和 115 离线流程

- 设置页可配置 OpenList 地址、token、用户名、密码、离线保存路径和云端库扫描根目录。
- 可用用户名、密码和可选 OTP 登录换取 token；服务端保存的用户名/密码可在 token 过期时自动重新登录，OTP 不用于自动重登。
- 连接检查会探测公共和账户 API，不把 token 返回给客户端。
- 支持读取远端文件安全元数据、列出目录预览、解析内部下载链接并传递 OpenList 返回的请求 headers。
- 磁链离线任务只在创建或重试时提交一次；offline worker 只轮询已提交任务，不会重复提交磁链。
- 离线完成后可定位云端文件并创建 transfer 任务；也可以手动“拉回本地”。
- 云端目录扫描会分页保存受限的文件/目录摘要，不保存 raw download URL；扫描结果可导入为漫画的 OpenList 资源。

#### OpenList 10008 重复任务恢复

- OpenList 返回离线任务已存在（错误码 10008）时，不重复提交磁链，而是把任务加入云端库恢复队列。
- 系统对配置的扁平云端库根目录建立分页索引，识别 `.zip` 和 `.cbz`，并按漫画标题和资源提示进行批量匹配。
- 同时发生的 10008 恢复共享一次 single-flight 扫描；新任务可在 TTL 内复用最近完成的索引。
- 唯一匹配会直接创建 transfer 任务；未找到或多候选会保存可理解的中文错误和目录指导。
- 管理页可强制重扫云端库，绕过 TTL，并重新匹配待恢复、上次未找到和歧义任务。

#### 本地传输和 aria2

- OpenList 文件可解析 raw URL 后，由服务端流式下载到缓存临时文件，再移动到下载入库目录并触发库扫描。
- aria2 provider 已接入 JSON-RPC，可检查连通性、提交 magnet/torrent、轮询状态和取消任务。
- aria2 直接写入下载入库目录，完成后只登记 final path 并扫描，不再移动文件，以保证 aria2 任务路径仍然有效。
- OpenList transfer 可在 aria2 可用时使用 aria2 直写；非 aria2 流程继续使用缓存临时文件加 finalization。
- finalization 会创建或复用下载专用 manga root，并扫描最终文件进入漫画库。

#### 当前下载限制

- 通用 `http` 类型资源的 builtin HTTP provider 适配器仍只返回“尚未接入”，不能作为独立 provider 执行。
- 没有独立常驻的生产任务守护进程。下载管理页打开时通过定时请求推进任务，或由调用方手动触发 worker API。
- OpenList、115 和 aria2 能力依赖用户自行运行和配置对应外部服务。

### 4.11 收藏与阅读队列

- 支持 `collection` 收藏分类和 `queue` 阅读队列两种类型。
- 集合保存名称、描述、启用状态和排序模式。
- 排序支持手动、最近加入和标题。
- 后台可创建、编辑、启停和删除集合。
- 只能添加可读漫画；重复添加是无操作，缺失或 remote-only 漫画会被拒绝。
- 支持移除漫画和保存手动顺序。
- 前台集合页只显示可读漫画。
- 启用的 queue 可计算当前漫画在队列中的位置和下一本，阅读器据此提供连续阅读入口。
- 集合及成员变更写入脱敏操作日志。

### 4.12 后台概览、设置、备份与数据清理

- 后台首页显示可读漫画数、本地文件数、缺失数、重复候选、最近扫描、缓存占用和最近操作。
- 设置持久化到 SQLite，敏感下载配置不会出现在前台页面。
- SQLite 备份导出只包含数据库快照，不包含漫画原文件和缓存图片。
- 数据清理支持按范围清除库/漫画记录、下载任务和缓存。
- 数据清理始终保留运行设置和 manga root 配置，不删除任何物理漫画文件。
- 主题模式当前固定为浅色，避免未适配的暗色组件产生对比度问题。
- 启动自动扫描、定时扫描、自动路径修复和扫描时计算完整 hash 在设置页中仅作为只读状态展示，当前没有执行能力。

## 5. HTTP API 参考

Route Handler 只负责请求解析、鉴权、调用模块服务和返回响应。业务规则位于 `src/modules`。

### 5.1 设置与系统

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET`, `PATCH` | `/api/settings` | 读取和更新运行设置 |
| `GET` | `/api/settings/backup` | 导出 SQLite 备份 |
| `GET`, `POST` | `/api/settings/data-reset` | 查看数据量和执行确认后的选择性清理 |
| `POST` | `/api/settings/openlist/login` | OpenList 登录并保存 token |
| `POST` | `/api/settings/openlist/check` | 检查 OpenList 连接 |
| `POST` | `/api/settings/aria2/check` | 检查 aria2 RPC 连接 |

### 5.2 漫画库、文件与阅读器

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/local-files/scan` | 扫描全部启用漫画根目录 |
| `POST` | `/api/local-files/recheck` | 重新检查缺失文件 |
| `POST` | `/api/local-files/[id]/repair` | 修改数据库中的文件路径 |
| `POST` | `/api/local-files/[id]/ignore` | 忽略缺失文件问题 |
| `POST` | `/api/admin/paths/[id]/open-folder` | 用系统文件管理器打开根目录 |
| `GET`, `POST`, `PUT` | `/api/comics/[id]/cover` | 读取、重新生成和上传封面 |
| `PATCH` | `/api/comics/[id]/metadata` | 更新漫画可编辑标题元数据 |
| `GET`, `POST`, `DELETE` | `/api/comics/[id]/tags` | 读取、绑定和移除标签 |
| `GET`, `PATCH` | `/api/comics/[id]/chapters/order` | 读取和保存章节顺序 |
| `PATCH` | `/api/comics/[id]/status` | 隐藏、软删除或恢复记录 |
| `POST`, `DELETE` | `/api/comics/[id]/merge` | 合并为章节或恢复独立漫画 |
| `GET` | `/api/comics/[id]/local-files` | 查看漫画本地文件 |
| `GET` | `/api/comics/[id]/sources` | 查看来源站记录 |
| `GET` | `/api/comics/[id]/resources` | 查看可下载资源 |
| `GET` | `/api/comics/[id]/logs` | 查看漫画相关操作日志 |
| `GET` | `/api/comics/[id]/progress` | 查看漫画阅读进度 |
| `GET` | `/api/pages/[pageId]` | 按 page ID 读取原图 |
| `GET` | `/api/pages/[pageId]/thumbnail` | 按 page ID 读取或生成缩略图 |
| `POST` | `/api/reader/progress` | 保存阅读进度 |

### 5.3 元数据、标签和集合

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/metadata/status` | 查询来源页与本地漫画的匹配状态 |
| `POST` | `/api/metadata/import` | 导入详情页元数据 |
| `POST` | `/api/metadata/import-with-magnet` | 导入元数据并为磁链创建 OpenList 离线任务 |
| `POST`, `PATCH`, `DELETE` | `/api/tags` | 创建、编辑和删除标签 |
| `GET`, `POST` | `/api/collections` | 列表和创建集合 |
| `GET`, `PATCH`, `DELETE` | `/api/collections/[id]` | 读取、编辑和删除集合 |
| `POST`, `DELETE`, `PUT` | `/api/collections/[id]/items` | 添加、移除和重排集合成员 |

### 5.4 下载

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET`, `POST` | `/api/downloads` | 列出资源/任务和创建任务 |
| `POST` | `/api/downloads/[id]/cancel` | 取消任务 |
| `POST` | `/api/downloads/[id]/retry` | 重试任务 |
| `POST` | `/api/downloads/[id]/delete` | 删除任务记录 |
| `POST` | `/api/downloads/[id]/open-folder` | 打开已完成文件位置 |
| `POST` | `/api/downloads/[id]/pull-back` | 从已完成离线任务创建本地传输 |
| `POST` | `/api/downloads/worker/tick` | 运行一次兼容传输 worker |
| `POST` | `/api/downloads/worker/offline-tick` | 轮询一次离线任务 |
| `POST` | `/api/downloads/worker/transfer-tick` | 推进一次传输任务 |
| `GET`, `POST` | `/api/downloads/openlist/cloud-scans` | 列出或创建 OpenList 云端扫描 |
| `POST` | `/api/downloads/openlist/cloud-scans/[id]/resources` | 把扫描文件导入为资源 |
| `POST` | `/api/downloads/openlist/library-index/rescan` | 强制重建云端库索引并重试恢复 |

## 6. 运行设置参考

| 设置 | 默认值 | 作用 |
| --- | --- | --- |
| `listenHost` | `127.0.0.1` | Web 服务监听地址 |
| `cacheDirectory` | `.data/cache` | 封面、缩略图、压缩包和临时下载缓存 |
| `cacheSizeMb` | `2048` | 缓存容量上限，单位 MB |
| `readerThumbnailTtlDays` | `30` | reader 缩略图过期天数 |
| `readerPreloadEnabled` | `true` | 是否预加载后续图片 |
| `readerPreloadAheadPages` | `2` | 向后预加载页数 |
| `readerThumbnailSidebarDefault` | `true` | 桌面 reader 默认显示缩略图栏 |
| `readerImmersiveDefault` | `false` | reader 默认进入沉浸模式 |
| `themeMode` | `light` | 当前固定浅色主题 |
| `metadataImportToken` | 空 | 浏览器扩展写接口令牌 |
| `downloadDefaultTargetDirectory` | 空 | 任务未指定目录时的默认下载目录 |
| `openlistEnabled` | `false` | 是否启用 OpenList provider |
| `openlistBaseUrl` | 空 | OpenList API 地址 |
| `openlistToken` | 空 | OpenList 本地访问 token |
| `openlistUsername`, `openlistPassword` | 空 | token 过期时自动重登的本地凭据 |
| `openlistOfflineSavePath` | `/115Open/Temp` | 115/OpenList 离线保存目录 |
| `openlistLibraryScanRoot` | `/115Open/HENTAI/exhentai` | 云端库索引和 10008 恢复根目录 |
| `aria2Enabled` | `false` | 是否启用 aria2 provider |
| `aria2RpcUrl` | 空 | aria2 JSON-RPC 地址 |
| `aria2RpcToken` | 空 | aria2 `--rpc-secret` |

## 7. 数据模型参考

当前 SQLite/Drizzle schema 包含以下业务表：

- 核心配置：`settings`、`manga_roots`、`scan_sessions`。
- 漫画库：`comics`、`local_files`、`chapters`、`pages`。
- 标签：`tags`、`comic_tags`、`chapter_tags`（章节标签关系已预留，暂无 UI）。
- 阅读：`reading_progress`。
- 元数据：`comic_sources`、`comic_resources`。
- 下载：`download_tasks`、`download_task_preparations`、`download_task_transfers`、`download_task_finalizations`。
- OpenList 扫描：`cloud_scan_sessions`、`cloud_scan_entries`、`openlist_library_index_sessions`、`openlist_library_index_entries`。
- 媒体与缓存：`media_assets`、`cache_entries`。
- 审计与组织：`operation_logs`、`collections`、`collection_comics`。

关键实体关系：

```text
manga_root 1 -> * local_file
comic      1 -> * local_file
comic      1 -> * chapter -> * page
comic      * -> * tag
comic      1 -> * source -> * resource -> * download_task
comic      1 -> 1 current reading_progress
collection * -> * comic
```

## 8. 常用操作

### 8.1 启动主应用并扫描本地漫画

1. 在仓库根目录启动 Web 应用：

   ```powershell
   npm run dev:web
   ```

2. 打开 `http://127.0.0.1:4317/admin/paths`，添加一个绝对路径漫画根目录。
3. 新建完成后等待首次扫描，或点击该路径的重新扫描按钮。
4. 回到 `http://127.0.0.1:4317/`，确认可读漫画出现在前台。

如果漫画没有出现，先在 `/admin/paths` 查看扫描摘要，再到 `/admin/files` 检查缺失和重复候选。

### 8.2 阅读并确认进度

1. 从首页打开漫画详情并进入阅读器。
2. 滚动到任意页面，或使用 `Space`、方向键和 `W/S`。
3. 返回漫画详情或后台漫画详情，确认最后页面和进度百分比已更新。

### 8.3 使用浏览器扩展导入与下载

1. 在 `/admin/settings` 配置 metadata 导入令牌；需要下载时再配置 OpenList 和 aria2。
2. 在 Chrome 的 `chrome://extensions` 启用开发者模式，选择“加载已解压的扩展程序”，目录指向 `apps/extension`。
3. 打开扩展 popup，填写 `http://127.0.0.1:4317` 和同一个导入令牌。
4. 打开支持的详情页，使用右下角 MangaTest 面板提交元数据，或点击“开启下载”。
5. 在 `/admin/comics` 确认漫画记录，在 `/admin/downloads` 查看离线和传输任务。

扩展代码变更后，需要在 `chrome://extensions` 点击 Reload，并硬刷新已打开的来源站页面。日常 unpacked 开发不需要重新打包。

### 8.4 备份与安全清理

1. 打开 `/admin/settings` 的备份与恢复区域。
2. 先导出 SQLite 快照。
3. 查看数据清理摘要，选择只清理库记录、下载任务或缓存。
4. 输入界面要求的确认文本后执行。

此流程不会删除 manga root 下的真实漫画文件，也不会清除运行设置和 manga root 配置。

## 9. 架构与安全解释

### 9.1 模块调用方向

```text
page / component / route handler
  -> module application service or repository
  -> domain rule / infrastructure adapter
  -> SQLite / filesystem / OpenList / aria2
```

- `library` 管理漫画目录和漫画业务记录。
- `local-files` 只处理文件系统事实和路径安全。
- `media-assets` 生成封面与缩略图。
- `reader` 读取 page ID、提供页面数据并保存进度。
- `metadata-ingest` 处理来源站元数据，不直接拥有下载规则。
- `downloads` 消费 `comic_resource`，通过 OpenList、aria2 或下载流执行资源获取。
- `admin` 负责编排和展示，不拥有核心业务规则。
- `apps/extension` 是独立运行环境，只通过 HTTP 与 `apps/web` 通信。

### 9.2 导入与下载分离

元数据导入可以只创建来源、标签和 remote-only 漫画，不要求立即下载。下载模块只消费已经持久化的资源。这使本地扫描、浏览器补充元数据和资源获取可以按任意顺序发生，也避免插件直接控制文件系统。

### 9.3 文件安全边界

- 软删除漫画记录不等于删除物理文件。
- 路径修复只更新数据库。
- 合并章节不移动文件，并且可逆。
- 物理迁移只开放给系统 root，要求明确确认，并检查目标目录安全性。
- 页面读取使用 page ID，客户端不能拼接本地路径。
- 日志和普通资源列表不记录完整 magnet；OpenList token 和 aria2 secret 不返回前台。

### 9.4 缓存取舍

ZIP/CBZ 不默认完整解压，可以降低磁盘放大和首次扫描时间，但首次读取冷页面时需要按需提取。封面和缩略图使用可失效缓存换取浏览与跳页速度，清理时同时使用容量和过期时间，避免缓存无限增长。

## 10. 原型范围

`apps/prototype` 保留了首页、漫画详情、阅读器、后台首页、漫画管理、路径、文件、标签和设置等视觉/交互原型。它使用 mock 数据和假状态，只用于验证信息密度、导航结构、页面布局与交互手感。

正式实现匹配原型页面时，应优先复用 Mantine 和原型中的 `App*` 组件方式。原型中的任何按钮或状态都不能单独作为“功能已实现”的证据。

## 11. 尚未实现或明确延期

- 通用 HTTP 资源的 builtin HTTP provider 独立执行。
- 独立常驻的下载 worker 服务和生产级任务调度。
- 更多来源站专用扩展适配器，以及列表页批量采集。
- 文件系统实时监听和启动时自动扫描。
- 定时扫描、自动路径修复和扫描时完整文件 hash。
- 物理文件删除 UI。
- 多用户账户、登录和权限系统。
- 局域网监听下完整的写 API token 策略。
- 完整暗色主题。
- RAR、CBR、7z 和 PDF 扫描/阅读。
- 章节标签管理 UI。

## 12. 开发与验证命令

```powershell
# 启动正式 Web 应用
npm run dev:web

# Web 静态检查和测试
npm run lint:web
npm run typecheck:web
npm test -w apps/web
npm run build:web

# 浏览器扩展检查；扩展改动必须同步递增 manifest/package 版本
npm run check:extension

# 可选：生成扩展分发 ZIP
npm run build -w apps/extension

# 启动或检查交互原型
npm run dev:prototype
npm run lint:prototype
npm run build:prototype
```

文档维护规则：实现新的用户可见功能、API、模块行为或关键工作流时，应在同一变更中更新本文。未完成能力必须留在“尚未实现或明确延期”，不能混入已实现功能。
