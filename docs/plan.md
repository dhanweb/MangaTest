# 漫画库系统项目计划

## 1. 项目定位

本项目是一个面向个人使用的本地漫画库管理系统。

它不是单纯的漫画阅读网站，而是一个完整的漫画导入、下载、整理、标签管理、收藏管理和连续阅读系统。

系统核心目标是：

```text
从漫画网站采集信息
  ↓
通过本地服务建立数据库记录
  ↓
调用 OpenList 提交 115 离线下载
  ↓
扫描 115 云端目录确认文件
  ↓
通过 OpenList 获取文件下载链接
  ↓
本地服务下载到本地 manga 目录
  ↓
数据库关联漫画信息、标签、来源、下载任务、本地文件
  ↓
前台网站展示和阅读
  ↓
后台网站管理和维护
```

项目最终形态由五部分组成：

```text
1. 浏览器插件
2. 本地服务
3. OpenList / 115 下载管线
4. 本地数据库
5. 漫画前台 + 后台 + 阅读器
```

## 1.1 已确认技术栈与运行方式

MVP 推荐使用 Next.js 全栈实现：

```text
Next.js App Router
TypeScript
SQLite
Drizzle ORM
better-sqlite3
Tailwind CSS
shadcn/ui
lucide-react
Vitest
Playwright
Sharp
yauzl 或 unzipper
```

运行方式：

```text
1. 本项目按本地自托管应用设计，不按 serverless / Vercel 部署设计。
2. Next.js 负责页面、API、管理界面和本地文件读取入口。
3. App Router 用于页面路由。
4. Route Handlers 用于 REST API、插件接口、图片流接口和文件服务接口。
5. Server Actions 可用于系统内部表单提交，但不能作为插件对外接口。
6. SQLite 作为本地数据库。
7. Drizzle ORM 负责 schema、迁移和类型安全查询。
8. Sharp 负责封面、缩略图和图片尺寸读取。
9. zip / cbz 扫描优先使用支持流式或懒加载读取的库，避免扫描时整包解压。
```

基础配置：

```text
HOST = 0.0.0.0
PORT = 3000
MANGA_ROOT = 一个绝对路径
DATA_DIR = 系统数据目录
DATABASE_URL = SQLite 数据库路径
```

---

# 2. 总体链路

当前已经跑通或基本确定的核心链路为：

```text
浏览器插件
  ↓
本地服务
  ↓
OpenList
  ↓
115 离线下载
  ↓
OpenList 访问 115 文件
  ↓
本地服务下载到本地 manga 目录
  ↓
本地数据库记录关联
  ↓
漫画网站前台 / 后台读取数据库展示
```

关键原则是：

```text
先建立业务记录，再下载；但导入和下载可以独立发生。
```

也就是说，浏览器插件采集到漫画信息和磁链后，必须先提交给本地服务，由本地服务创建漫画、资源、下载任务等数据库记录，然后再调用 OpenList 添加 115 离线任务。

不能先把磁链丢给 115，再回头猜它属于哪部漫画。

同时，导入和下载必须解耦：

```text
导入：创建或补充漫画、来源、标签、资源等业务记录。
下载：围绕已有资源创建下载任务，并在文件落地后匹配回漫画。
```

这样允许：

```text
1. 先本地扫描已有漫画，再用浏览器插件补充标签和来源。
2. 先用浏览器插件采集来源和标签，但暂不下载。
3. 先导入磁链资源，稍后再决定是否下载。
4. 下载完成后再匹配到已有漫画。
```

---

# 3. 系统模块划分

项目可以拆成以下核心模块：

```text
1. 浏览器插件采集模块
2. 本地服务 API 模块
3. 导入与下载管线模块
4. OpenList / 115 适配模块
5. 云端目录扫描模块
6. 本地下载与归档模块
7. 本地文件扫描模块
8. 漫画元数据模块
9. 标签与翻译模块
10. 前台漫画库模块
11. 后台管理模块
12. 连续阅读器模块
13. 收藏分类与阅读队列模块
14. 搜索与筛选模块
15. 去重与缺失检测模块
16. 备份与恢复模块
17. 日志与异常处理模块
```

其中第一阶段最核心的是：

```text
导入与下载管线
本地数据库
本地漫画库扫描
前台阅读器
后台管理
```

---

# 4. 浏览器插件模块

## 4.1 模块定位

浏览器插件只负责从漫画网站页面采集最准确的信息。

插件不直接操作 OpenList，不直接操作 115，也不直接决定本地文件路径。

插件采集完成后，只负责把数据提交给本地服务。

插件后续优先只兼容：

```text
Chrome Manifest V3
```

如果系统启用局域网访问，插件调用写接口时建议支持 `IMPORT_TOKEN`：

```text
1. token 由系统设置页生成。
2. 插件保存到 chrome.storage.local。
3. 请求时放入 X-MangaTest-Token。
4. token 只用于防止局域网内其他设备随便调用导入接口，不作为完整账号权限系统。
```

## 4.2 采集内容

插件需要采集：

```text
漫画标题
作者
标签
封面
详情页 URL
站点漫画 ID
磁链 / 种子链接
章节标题
资源标题
资源大小
页面来源站点
```

## 4.3 标签采集原则

对于 E-Hentai 这类网站，因为用户安装了 EhSyringe 汉化插件，页面显示文本可能已经被替换成中文。

因此插件不要优先读取页面显示文本。

更稳的采集优先级是：

```text
1. 优先从标签链接 href / f_search 参数解析英文原始标签
2. 其次读取 DOM 属性里的原始信息
3. 最后才读取页面显示文本
```

数据库里保存英文 canonical 标签，例如：

```text
female:sole female
artist:xxx
language:chinese
```

前台展示时再通过标签翻译表显示为：

```text
女性:单女主
艺术家:xxx
语言:中文
```

## 4.4 插件功能

插件前期只需要实现：

```text
1. 读取当前漫画页面信息
2. 读取磁链 / 种子链接
3. 一键提交给本地服务
4. 查询当前页面是否已入库
5. 显示当前资源状态：未导入 / 已导入 / 下载中 / 已完成
6. 复制原始 JSON，方便调试
```

后期可以扩展：

```text
1. 批量导入当前页面列表
2. 手动修正标题和标签
3. 显示本地已有漫画匹配结果
4. 支持多个漫画网站
```

---

# 5. 本地服务模块

## 5.1 模块定位

本地服务是整个系统的核心业务层。

它负责：

```text
接收浏览器插件提交的数据
写入本地数据库
调用 OpenList 添加离线任务
轮询 OpenList 任务状态
扫描 115 目标目录
获取云端文件信息
下载文件到本地 manga 目录
扫描本地文件
更新数据库状态
为前台和后台提供 API
```

## 5.2 核心原则

本地服务必须掌握完整链路，不能把业务历史交给 OpenList 或 115。

OpenList 只作为工具使用。

本地服务负责长期记录：

```text
漫画属于哪个网站
磁链对应哪个漫画
OpenList 临时任务 ID
115 云端目标目录
云端文件路径
本地文件路径
资源状态
下载状态
错误信息
重试次数
```

## 5.3 应用路径与服务边界

本项目是一个系统，不拆成独立前台和后台。

推荐路径：

```text
/                 漫画首页
/comics           漫画列表
/comics/:id       漫画详情
/reader/:id       阅读器
/admin            管理首页
/admin/files      文件维护
/admin/tasks      下载任务，后续阶段实现
/admin/tags       标签管理
/settings         系统设置
```

Route Handlers 负责对外 API、插件接口、页面图片流和文件读取接口。

Server Actions 可以用于系统内部表单提交，但插件、外部工具、下载器回调等应使用显式 API。

## 5.4 推荐 API 能力

本地服务需要提供这些能力：

```text
POST /api/import/page
接收浏览器插件提交的漫画页面数据

POST /api/download/create
创建下载任务并提交 OpenList

GET /api/download/tasks
查看下载任务列表

POST /api/download/retry
重试失败任务

POST /api/cloud/scan
扫描 115 云端目标目录

POST /api/local/scan
扫描本地 manga 目录

GET /api/comics
获取漫画列表

GET /api/comics/:id
获取漫画详情

POST /api/comics/:id/update
更新漫画信息

GET /api/tags
获取标签列表

POST /api/tags/translate
更新标签翻译

GET /api/reader/:comicId
获取阅读器所需页面数据

GET /api/pages/:pageId
读取阅读器单页图片

GET /api/covers/:comicId
读取漫画封面

GET /api/settings
读取系统设置

POST /api/settings
更新系统设置，例如 manga 根目录
```

实际接口名称可以后续调整，但能力要保留。

---

# 6. 导入与下载管线

## 6.1 模块定位

导入与下载管线是项目第一个核心模块。

它负责从漫画网站页面到本地漫画文件落地的完整链路。

## 6.2 状态流

推荐状态流为：

```text
created
  ↓
metadata_saved
  ↓
submitted_to_openlist
  ↓
offline_downloading
  ↓
waiting_cloud_file
  ↓
cloud_file_found
  ↓
local_downloading
  ↓
local_completed
  ↓
scanned
  ↓
linked
  ↓
ready
```

异常状态包括：

```text
submit_failed
offline_failed
cloud_file_not_found
local_download_failed
local_file_missing
scan_failed
link_failed
```

## 6.3 具体流程

完整流程如下：

```text
漫画网站页面
  ↓
浏览器插件采集漫画信息、标签、封面、磁链/种子
  ↓
提交给本地服务
  ↓
本地服务创建 comic / comic_source / comic_resource / download_task
  ↓
本地服务调用 OpenList 添加 115 离线任务
  ↓
OpenList 返回临时 task id
  ↓
本地服务保存 provider_task_id
  ↓
本地服务轮询 OpenList 任务状态
  ↓
任务完成或任务消失后，扫描 115 目标目录
  ↓
匹配云端文件
  ↓
记录 cloud_file_path
  ↓
通过 OpenList 获取文件下载链接
  ↓
本地服务下载到本地 manga 目录
  ↓
使用 .tmp / .download 临时文件机制
  ↓
下载完成后校验大小
  ↓
重命名为最终文件
  ↓
记录 local_file_path
  ↓
扫描本地文件并生成封面、页数、缩略图
  ↓
资源状态变为 ready / linked
```

## 6.4 OpenList 的定位

OpenList 只负责：

```text
115 登录与挂载
115 离线任务提交
115 文件列表访问
115 文件下载链接获取
WebDAV / 文件访问能力
```

OpenList 不负责：

```text
漫画业务关联
来源站信息管理
标签管理
下载历史管理
本地文件归档规则
阅读状态
收藏分类
```

这些都由本地服务和数据库负责。

## 6.5 导入与下载解耦

导入和下载是两个独立动作。

导入包括：

```text
1. 本地扫描导入：文件已经在本地，系统创建漫画、章节、页面、封面和基础元数据。
2. 插件元数据导入：浏览器插件提交来源站标题、标签、封面、URL、站点 ID、磁链等信息。
3. 手动导入：用户手动编辑或补充漫画信息。
```

下载包括：

```text
1. 根据 comic_resource 创建 download_task。
2. 调用内置下载器、OpenList、aria2 或其他 provider。
3. 下载完成后生成或匹配 local_file。
4. 再把 local_file 关联回 comic / comic_resource。
```

重复导入行为：

```text
1. 如果 API 请求没有指定 duplicate_action 且发现重复，返回冲突结果和候选漫画列表。
2. duplicate_action = update 时，更新已有漫画的来源、标签或资源。
3. duplicate_action = ignore 时，不修改已有记录。
4. duplicate_action = create_separate 时，允许创建独立漫画。
```

---

# 7. OpenList / 115 适配模块

## 7.1 添加 115 离线任务

本地服务调用 OpenList 接口：

```text
/api/fs/add_offline_download
```

关键参数：

```text
path = OpenList 里的 115 云端保存目录
tool = 115 Cloud
urls = magnet / http / ed2k 链接数组
```

例如：

```text
path = /115Open/云下载
tool = 115 Cloud
```

注意：

```text
path 不是 Windows 本地路径。
path 是 OpenList 里的 115 云端目录路径。
```

## 7.2 保存 OpenList 任务 ID

OpenList 返回的 id 应保存到：

```text
download_tasks.provider_task_id
```

它的作用是临时跟踪任务进度。

但它不是：

```text
115 文件 ID
本地文件 ID
长期下载历史 ID
```

## 7.3 查询任务状态

可轮询：

```text
/api/task/offline_download/undone
/api/task/offline_download_transfer/undone
```

注意：

```text
任务还在列表里：说明未完成或正在处理
任务 progress 增加：更新数据库进度
任务 error 不为空：标记失败
任务消失：不一定失败，也可能已经完成或被清理
```

所以任务列表只能作为临时状态来源，不能作为长期记录来源。

## 7.4 扫描 115 目标目录

离线任务完成或消失后，本地服务必须扫描目标目录，例如：

```text
/115Open/云下载
```

通过目录扫描确认文件是否真的出现在 115 网盘里。

匹配依据包括：

```text
info_hash
磁链 dn 名称
资源标题
文件名
文件大小
添加时间
目标目录
torrent 文件列表
```

如果是 torrent 文件，推荐本地解析 torrent，提前保存：

```text
info_hash
文件列表
总大小
文件名
```

这样后续匹配云端文件更准确。

---

# 8. 本地下载与归档模块

## 8.1 下载原则

本地下载由本地服务自己完成，不交给独立同步工具。

原因是本地服务需要保证链路不断：

```text
知道文件属于哪个漫画
知道当前状态
知道下载到哪里
知道失败后如何重试
知道下载完成后如何更新数据库
```

## 8.2 下载流程

```text
发现 cloud_file_path
  ↓
通过 OpenList 获取下载链接
  ↓
下载到本地临时文件
  ↓
校验文件大小
  ↓
重命名为最终文件
  ↓
写入 local_file_path
  ↓
更新资源状态
```

## 8.3 临时文件机制

下载时不要直接写最终文件。

推荐：

```text
xxx.zip.download
或
xxx.zip.tmp
```

下载完成并校验成功后，再重命名为：

```text
xxx.zip
```

这样可以避免半成品文件被扫描器误认为已经完成。

## 8.4 下载 provider 预留

MVP 不实现下载，但数据库和服务边界要预留下载 provider。

下载 provider 建议：

```text
builtin
openlist
aria2
manual
```

内置下载器后续要求：

```text
1. 使用 .download 临时文件。
2. 支持 HTTP Range 断点续传。
3. 保存 ETag 和 Last-Modified。
4. 服务重启后可以恢复未完成下载。
5. 下载成功后再重命名为最终文件。
6. 失败任务保留记录，不硬删除。
```

aria2 接入原则：

```text
1. aria2 只作为 provider。
2. 业务状态仍由本地数据库记录。
3. provider_task_id 保存 aria2 gid。
4. aria2 不直接决定漫画归属。
```

## 8.5 本地目录结构

推荐初期目录结构：

```text
manga/
  incoming/
  library/
  failed/
  temp/
```

说明：

```text
incoming：刚下载完成但还没整理的文件
library：已经入库完成的漫画
failed：下载失败或解析失败的文件
temp：临时下载文件
```

后期可以根据作者或来源继续细分：

```text
manga/library/{artist}/{title}/
manga/library/{source}/{gallery_id}/
```

但前期不要过早复杂化。

---

# 9. 本地文件扫描模块

## 9.1 模块定位

本地文件扫描模块负责让数据库和硬盘文件保持一致。

它负责：

```text
扫描本地 manga 目录
扫描普通目录、zip、cbz
识别新增漫画
识别缺失文件
识别文件变更
计算文件 hash
生成封面
统计页数
生成缩略图
修复路径
检测重复文件
```

## 9.2 MVP 支持格式与扫描规则

MVP 支持：

```text
普通目录
zip
cbz
```

MVP 图片格式建议支持：

```text
jpg
jpeg
png
webp
gif
```

扫描规则：

```text
1. 漫画根目录必须是绝对路径。
2. 根目录下的一个目录、一个 zip、一个 cbz，默认识别为一本漫画。
3. 扫描到漫画后，默认使用文件名或目录名作为漫画名称。
4. 文件名解析作者的规则暂不实现，但保留后续扩展入口。
5. 目录或压缩包内只有图片时，生成一个默认章节。
6. 目录或压缩包内存在一层或多层图片文件夹时，每个包含图片的文件夹可以生成一个章节。
7. 如果根目录图片和子目录章节同时存在，根目录图片生成“未分章”章节，子目录继续生成独立章节。
8. 忽略 __MACOSX、.DS_Store、隐藏文件、非图片文件和空目录。
9. 页序和章节序使用自然排序，例如 1、2、10，而不是 1、10、2。
10. 扫描时不强制移动原文件。
```

## 9.3 hash 的作用

hash 可以理解成文件指纹。

它用于：

```text
判断是不是同一个文件
判断是否重复下载
判断文件是否被修改
判断数据库记录和本地文件是否还能对上
```

例如文件改名后，只要内容没变，hash 仍然一致，可以自动或半自动修复路径。

文件指纹规则：

```text
1. local_file 记录 path、file_size、mtime、sha256。
2. 目录型漫画可记录目录快照 hash，快照由相对路径、大小、mtime 或页面 hash 组合生成。
3. zip / cbz 优先记录压缩包自身 sha256。
4. hash 用于重复检测、移动后修复、文件变更检测。
```

## 9.4 缺失文件检测

数据库里记录了：

```text
comic_id
local_file_id
local_file_path
file_hash
file_size
```

扫描时检查：

```text
local_file_path 是否存在
文件大小是否一致
hash 是否一致
页数是否一致
```

如果文件不存在，标记为：

```text
local_file_missing
```

如果文件存在但内容变了，标记为：

```text
local_file_changed
```

如果在其他目录发现相同 hash 的文件，可以提示：

```text
疑似同一文件，是否修复路径？
```

## 9.5 封面选择规则

封面优先级：

```text
1. 手动上传封面。
2. 漫画目录或压缩包内名为 cover 的图片。
3. 第一页图片。
```

规则：

```text
1. 手动上传的封面保存到系统数据目录，例如 data/covers/{comic_id}/cover.webp。
2. 手动上传的封面不要写入漫画原目录或压缩包。
3. 自动封面可缓存到系统数据目录。
4. 数据库记录 cover_path、cover_source、cover_updated_at。
5. cover_source = manual | embedded_cover | first_page。
6. 如果手动封面被删除，系统可以回退到 embedded_cover 或 first_page。
```

---

# 10. 数据库设计

## 10.1 核心表

推荐核心表：

```text
comic
comic_source
comic_resource
resource_local_file
download_task
cloud_file
local_file
tag
comic_tag
tag_translation
favorite_category
favorite_item
reading_progress
reading_queue
comic_relation
chapter
page
app_setting
```

## 10.2 comic

记录漫画主体信息：

```text
id
display_title
original_title
file_title
metadata_query_title
cover_path
cover_source
cover_updated_at
primary_artist
description
status
deleted_at
created_at
updated_at
```

标题字段含义：

```text
display_title：系统展示名称，默认等于 file_title，可编辑，通常偏中文。
original_title：原始名称，可能是日文、英文或来源站原名。
file_title：扫描时从文件名或目录名得到，作为原始文件线索，不随用户编辑改变。
metadata_query_title：将来提交 API 获取标签时使用的名称，可能需要用日文或来源站名称。
```

封面字段含义：

```text
cover_source = manual | embedded_cover | first_page
```

作者规则：

```text
1. primary_artist 可以为空。
2. MVP 不从文件名强行解析作者。
3. 后续保留作者解析器和人工指定主作者能力。
```

## 10.3 comic_source

记录来源站信息：

```text
id
comic_id
source_site
source_url
source_comic_id
metadata_source
raw_metadata_json
created_at
updated_at
```

metadata_source 可以是：

```text
browser_plugin
ehentai_api
manual
local_scan
```

## 10.4 comic_resource

记录资源信息：

```text
id
comic_id
resource_title
resource_type
magnet
torrent_path
info_hash
expected_file_name
expected_size
status
created_at
updated_at
```

resource_type 可以是：

```text
local
magnet
torrent
http
openlist
manual
```

MVP 的本地扫描可以创建 `resource_type = local` 的 comic_resource，用于把本地文件导入也纳入统一资源模型。

## 10.5 resource_local_file

连接资源和本地文件：

```text
id
resource_id
local_file_id
match_type
confidence
created_at
```

设计原因：

```text
1. 一个 comic_resource 可以关联零个、一个或多个 local_file。
2. 一个 local_file 也可以被多个 comic_resource 候选匹配。
3. 一个 torrent 可能下载出多个文件，不能假设 resource 和 local_file 永远是一对一。
```

## 10.6 download_task

记录下载任务：

```text
id
resource_id
provider
provider_task_id
tool
target_cloud_dir
status
progress
bytes_downloaded
total_bytes
supports_resume
temp_file_path
final_file_path
etag
last_modified
error_message
retry_count
created_at
updated_at
completed_at
```

provider 可以是：

```text
builtin
openlist
aria2
manual
```

tool 可以是：

```text
115 Cloud
```

download_task 不硬删除，取消或隐藏时标记为：

```text
canceled
archived
```

## 10.7 cloud_file

记录 115 云端文件：

```text
id
resource_id
cloud_provider
cloud_file_path
cloud_file_name
cloud_file_size
cloud_file_id
matched_by
created_at
updated_at
```

matched_by 可以是：

```text
info_hash
file_name
file_size
torrent_file_list
manual
```

## 10.8 local_file

记录本地文件：

```text
id
comic_id
local_file_path
file_name
file_size
file_hash
mtime
file_type
directory_snapshot_hash
page_count
cover_path
status
created_at
updated_at
```

file_type 可以是：

```text
directory
zip
cbz
```

local_file 是磁盘实体，不等同于 comic。comic 是系统内展示和管理的一本漫画，local_file 是一个真实目录或压缩包。

## 10.9 tag

标签表保存英文 canonical 标签：

```text
id
namespace
name
canonical
source
count
created_at
updated_at
```

例如：

```text
namespace = female
name = sole female
canonical = female:sole female
```

没有 namespace 的标签可以归入：

```text
misc
```

## 10.10 comic_tag

漫画和标签的关联表：

```text
id
comic_id
tag_id
source
confidence
created_at
```

source 可以是：

```text
manual
scan
plugin
api
merged_child
```

## 10.11 tag_translation

标签翻译表：

```text
id
tag_id
locale
translated_namespace
translated_name
alias
source
updated_at
```

前台默认显示中文。中文翻译缺失时，显示 canonical 或英文 name。

翻译不改变 canonical。标签别名用于搜索和展示，不改变原始标签记录。

## 10.12 favorite_category

收藏分类表：

```text
id
name
description
default_sort_mode
created_at
updated_at
```

## 10.13 favorite_item

收藏条目表：

```text
id
category_id
comic_id
sort_order
added_at
note
```

每个收藏分类拥有独立的手动排序。

## 10.14 reading_progress

阅读进度表：

```text
id
comic_id
chapter_id
page_index
scroll_offset
percent
status
last_read_at
```

## 10.15 reading_queue

阅读队列表：

```text
id
source_type
source_id
sort_mode
filter_json
comic_ids_snapshot
current_comic_id
current_chapter_id
page_index
scroll_offset
created_at
updated_at
```

用于支持从收藏分类、搜索结果、作者页进入后的连续阅读。

## 10.16 chapter

阅读章节表：

```text
id
comic_id
source_local_file_id
title
sort_order
source_path
page_count
created_at
updated_at
```

章节来源：

```text
1. 一个目录或压缩包内只有图片时，生成一个默认章节。
2. 一个目录或压缩包内有多个图片文件夹时，每个图片文件夹生成一个章节。
3. 其他漫画也可以通过 comic_relation 挂载成当前漫画的章节来源。
```

## 10.17 page

阅读页表：

```text
id
chapter_id
source_local_file_id
source_path
page_index
width
height
file_size
created_at
updated_at
```

page 的 source_path 可以指向：

```text
1. 普通目录下的相对图片路径。
2. zip / cbz 内的相对图片路径。
```

## 10.18 comic_relation

用于把其他漫画作为当前漫画的章节或关联内容：

```text
id
parent_comic_id
child_comic_id
relation_type
sort_order
hide_child_from_library
tag_merge_mode
created_at
updated_at
```

字段含义：

```text
relation_type = chapter
hide_child_from_library = true 时，子漫画不再作为独立漫画显示在普通列表中。
tag_merge_mode = none | copy_once | dynamic_union
```

推荐默认：

```text
tag_merge_mode = dynamic_union
hide_child_from_library = true
```

## 10.19 app_setting

系统设置表：

```text
key
value
updated_at
```

第一阶段至少需要保存：

```text
manga_root
data_dir
```

---

# 11. 前台漫画网站功能

## 11.1 首页

首页提供：

```text
最近添加
最近阅读
继续阅读
收藏分类入口
随机漫画
待处理漫画入口
下载中漫画入口
```

## 11.2 漫画列表

漫画列表支持：

```text
网格视图
列表视图
标题搜索
作者筛选
标签筛选
状态筛选
来源筛选
阅读状态筛选
排序
```

排序支持：

```text
添加时间
更新时间
标题
文件名
作者
阅读时间
随机
```

## 11.3 漫画详情页

详情页展示：

```text
封面
标题
原始标题
作者
标签
来源站
来源 URL
站点漫画 ID
资源状态
本地文件状态
章节列表
收藏按钮
阅读按钮
继续阅读按钮
相关漫画
个人备注
```

标签显示策略：

```text
数据库存英文 canonical 标签
前台默认显示中文翻译
需要时显示英文原文
```

## 11.4 搜索与筛选

支持基础搜索：

```text
标题
作者
标签
来源
状态
```

后期支持高级搜索语法：

```text
artist:xxx female:suit -male:xxx language:chinese
```

---

# 12. 后台管理功能

## 12.1 后台首页

后台仪表盘显示：

```text
漫画总数
已入库数量
待处理数量
下载中数量
失败任务数量
缺标签数量
缺封面数量
疑似重复数量
本地文件缺失数量
最近 7 天新增数量
```

## 12.2 漫画管理

后台漫画列表支持：

```text
查看
编辑
删除漫画记录
重新扫描
重新匹配
重新生成封面
重新生成缩略图
修复路径
批量操作
```

删除语义必须区分数据库记录、系统缓存和真实漫画文件：

```text
1. 默认软删除 comic，不删除硬盘文件。
2. 删除 comic 时可以删除 reading_progress。
3. download_task 默认不删除，只标记 archived 或 canceled。
4. local_file 默认不删除，只解除展示关系或保留为孤立文件记录。
5. 删除真实文件必须是单独操作，UI 必须二次确认，并显示将删除的绝对路径。
6. 系统生成的封面、缩略图属于缓存，可以重新生成。
7. 手动上传封面属于用户数据，删除前需要确认。
```

## 12.3 下载任务管理

下载任务中心显示：

```text
待提交
已提交
离线中
等待云端文件
已找到云端文件
本地下载中
已完成
失败
```

支持操作：

```text
重试
取消
重新扫描云端目录
重新获取下载链接
重新下载本地文件
手动指定云端文件
手动指定本地文件
查看日志
```

## 12.4 标签管理

后台标签管理支持：

```text
查看英文 canonical 标签
查看中文翻译
编辑翻译
导入 EhTagTranslation 映射
合并重复标签
设置标签别名
统计标签使用次数
```

## 12.5 文件维护

文件维护功能包括：

```text
扫描 manga 目录
检测缺失文件
检测文件变更
检测重复文件
修复移动后的路径
清理临时文件
清理失败文件
```

---

# 13. 连续阅读器模块

## 13.1 阅读器定位

阅读器只做一种核心模式：

```text
垂直无缝阅读
```

不做横向翻页、双页模式、右往左翻页。

## 13.2 基础功能

阅读器支持：

```text
垂直图片流
图片懒加载
提前预加载
阅读进度保存
点击返回详情页
轻点显示 / 隐藏 UI
当前页码显示
当前阅读百分比
```

实现建议：

```text
1. 阅读器通过 page 记录读取图片，不直接遍历文件系统。
2. 普通目录图片按 source_path 读取。
3. zip / cbz 图片通过 source_local_file_id + source_path 从压缩包读取。
4. 图片响应由 /api/pages/:pageId 提供。
5. 阅读进度在滚动停止后节流保存，例如 1 秒内最多保存一次。
6. 阅读器退出或页面隐藏时主动保存一次进度。
7. 大图按浏览器原生懒加载和 IntersectionObserver 控制预加载。
```

## 13.3 缩略图滚动条

阅读页面需要有缩略图版本的滚动条。

功能包括：

```text
右侧或底部显示缩略图轨道
每页对应一个缩略图
当前阅读位置高亮
点击缩略图跳转到对应页
拖动缩略图快速跳页
跨章节显示分隔
跨漫画显示分隔
移动端可默认隐藏，点击边缘展开
```

## 13.4 自动提前加载下一话

当用户接近当前章节底部时，系统自动预加载下一话。

触发条件可以是：

```text
当前章节阅读进度超过 85%
距离底部小于 3000px
剩余页数小于 5 页
```

当前章节读完后，下一话自动接在下面，实现无缝阅读。

## 13.5 自动加载收藏列表下一本

如果用户是从收藏分类进入阅读器，系统生成阅读队列。

当前漫画所有话读完后，自动加载当前收藏分类里的下一本漫画。

优先级：

```text
1. 当前漫画的下一话
2. 当前漫画所有话完成后，加载阅读队列的下一本漫画
3. 队列结束后，提示当前列表已读完
```

## 13.6 阅读分隔条

因为阅读器会跨章节、跨漫画无缝加载，所以必须插入分隔条。

例如：

```text
—— 第 1 话结束 ——
正在加载第 2 话

—— 当前漫画已读完 ——
接下来：下一本漫画
```

分隔条显示：

```text
漫画标题
章节标题
作者
当前来源
当前队列进度
```

---

# 14. 收藏分类与阅读队列

## 14.1 收藏分类

系统支持多个收藏分类，例如：

```text
想看
已整理
画风喜欢
剧情好
高质量
待下载
待补标签
```

一本漫画可以加入多个收藏分类。

## 14.2 收藏分类排序

每个收藏分类支持：

```text
添加时间排序
更新时间排序
文件名排序
标题排序
作者排序
手动拖拽排序
```

## 14.3 作者排序

作者排序优先使用：

```text
primary_artist
```

如果一本漫画有多个作者，后台可以指定主作者。

没有作者的漫画排在最后。

## 14.4 手动拖拽排序

每个收藏分类拥有独立的手动排序。

拖拽排序规则：

```text
选择“手动排序”后进入拖拽模式
拖动漫画卡片调整顺序
拖拽完成后自动保存或手动保存
下一次切换到手动排序时加载保存的顺序
```

推荐默认：

```text
移动端自动保存
PC 端可选择手动保存
```

## 14.5 阅读队列快照

从收藏分类进入阅读器时，系统生成阅读队列快照。

快照包括：

```text
来源类型：收藏分类
分类 ID
排序方式
过滤条件
漫画 ID 列表
当前漫画位置
当前章节
当前页
滚动位置
```

这样阅读过程中即使收藏分类排序发生变化，也不会导致当前阅读顺序混乱。

---

# 15. 标签与翻译系统

## 15.1 标签存储原则

数据库保存英文 canonical 标签。

例如：

```text
female:sole female
artist:xxx
language:chinese
```

前台通过翻译表显示中文。

规则：

```text
1. canonical 标签使用 namespace:name。
2. 没有 namespace 的标签可以使用 misc:name。
3. canonical 永远保存英文或来源站原始标签。
4. 中文翻译缺失时，前台显示 canonical 或英文 name。
5. 翻译不改变 canonical。
6. 标签别名用于搜索和展示，不改变原始标签记录。
```

## 15.2 标签来源

标签来源包括：

```text
浏览器插件
E-Hentai API
手动添加
本地导入
历史数据迁移
```

## 15.3 标签翻译

支持导入 EhTagTranslation / EhSyringe 使用的标签映射数据。

翻译表独立维护，不改变原始 canonical 标签。

显示方式支持：

```text
只显示中文
只显示英文
中英双显
```

其他漫画作为章节合并到当前漫画时，标签合并模式可以是：

```text
none：不合并标签。
copy_once：建立关系时把子漫画标签复制到父漫画，之后不自动同步。
dynamic_union：展示父漫画时动态合并子漫画标签并去重，不改变原始标签记录。
```

---

# 16. 去重与匹配

## 16.1 去重依据

系统支持通过以下方式检测重复：

```text
source_url
source_comic_id
info_hash
magnet
torrent hash
文件 hash
文件大小
标题相似度
封面相似度
页数
标签相似度
```

## 16.2 匹配优先级

推荐优先级：

```text
1. source_site + source_comic_id
2. source_url
3. info_hash
4. torrent 文件列表
5. 文件 hash
6. 文件名 + 文件大小
7. 标题相似度 + 标签相似度
```

## 16.3 疑似重复页面

后台提供疑似重复页面，用于人工确认：

```text
疑似同来源
疑似同磁链
疑似同文件
疑似同标题
疑似同封面
```

---

# 17. 备份与恢复

系统必须支持备份。

备份内容包括：

```text
数据库
标签翻译表
漫画元数据
下载任务记录
收藏分类
阅读进度
系统配置
```

建议支持：

```text
手动备份
定时备份
保留最近 N 份备份
导入恢复
导出 JSON
导出 SQLite
```

需要重点保护的数据不是漫画文件本身，而是：

```text
来源链接
标签
翻译
阅读记录
收藏分类
下载链路
本地路径映射
个人备注
```

---

# 18. 安全设计

系统默认面向本地使用。

安全策略：

```text
MVP 不做用户登录系统
允许监听局域网 IP
默认面向可信局域网使用
外网访问需要手动开启，且后续必须补充认证
插件或外部工具调用写接口时建议使用 IMPORT_TOKEN
OpenList token / 115 token / cookie 不暴露给前台
敏感配置加密或至少不明文展示
关键操作记录日志
```

日志策略：

```text
1. 可以记录来源 URL。
2. 可以记录本地文件路径。
3. 不记录完整 magnet。
4. 如需排查 magnet，只记录 hash、长度或脱敏后的前后片段。
5. 不在前台暴露 OpenList token、115 cookie 或其他敏感配置。
```

危险操作：

```text
1. 删除真实硬盘文件必须二次确认。
2. 删除真实硬盘文件时必须显示绝对路径。
3. 批量物理删除不进入 MVP。
```

---

# 19. 开发阶段计划

## 第一阶段：本地漫画库 MVP

目标：

```text
先让本地漫画能被扫描、入库、展示、阅读。
```

功能：

```text
设置绝对路径形式的 manga 根目录
本地 manga 目录扫描
普通目录 / zip / cbz 扫描
章节和页面入库
封面自动选择
漫画列表
漫画详情
垂直无缝阅读器
阅读进度保存
基础标签
基础搜索
后台基础编辑
基础文件维护
```

完成标准：

```text
手动放入漫画文件后，系统可以扫描出来
可以生成封面
可以进入详情页
可以垂直无缝阅读
可以保存阅读进度
修改 display_title 后 file_title 不变化
删除漫画记录时本地原文件不会被删除
```

第一阶段暂不做：

```text
浏览器插件
OpenList / 115
aria2
自动下载
用户登录系统
rar / cbr / 7z / pdf
收藏分类连续阅读队列
```

---

## 第二阶段：数据库与后台维护完善

目标：

```text
让漫画库可维护。
```

功能：

```text
编辑标题
编辑 original_title / metadata_query_title
编辑标签
编辑作者
修改封面
重新扫描
检测缺失文件
计算 hash
修复路径
批量操作
标签翻译表
手动上传封面
删除语义和软删除恢复
```

完成标准：

```text
数据库和本地文件可以长期保持一致
文件移动或缺失可以被发现
标签可以英文存储、中文显示
```

---

## 第三阶段：浏览器插件导入

目标：

```text
从漫画网站一键采集元数据。
```

功能：

```text
插件读取标题、作者、标签、封面、URL、站点 ID
插件解析英文 canonical 标签
插件采集磁链 / 种子链接
插件提交本地服务
本地服务先入库
插件元数据可以关联到已有本地扫描漫画
重复导入时允许更新、忽略、另存为独立漫画
前台显示已导入状态
```

完成标准：

```text
在漫画网站页面点击插件按钮后，本地数据库生成漫画记录和资源记录。
```

---

## 第四阶段：OpenList / 115 下载管线

目标：

```text
打通从磁链到本地 manga 文件的自动下载。
```

功能：

```text
本地服务调用 OpenList 添加 115 离线任务
保存 OpenList task id
轮询 undone 任务
扫描 115 云端目标目录
匹配云端文件
获取 OpenList 下载链接
下载到本地 manga 目录
更新 local_file_path
下载完成后自动扫描入库
保留 aria2 provider 接入边界
```

完成标准：

```text
在漫画网站点击导入下载后，最终本地 manga 目录出现文件，并且数据库自动关联到对应漫画。
```

---

## 第五阶段：收藏分类与连续阅读

目标：

```text
把阅读体验做成核心优势。
```

功能：

```text
多个收藏分类
收藏分类排序
手动拖拽排序
阅读队列快照
自动加载下一话
自动加载收藏分类下一本
缩略图滚动条
跨话 / 跨漫画分隔条
继续阅读当前队列
```

完成标准：

```text
从收藏分类进入阅读器后，可以按当前排序连续读完当前漫画所有话，再自动进入下一本漫画。
```

---

## 第六阶段：高级整理能力

目标：

```text
提升大规模漫画库管理体验。
```

功能：

```text
高级搜索语法
疑似重复检测
作者页
系列页
标签统计
随机推荐
相似漫画
批量标签修正
批量移动归档
```

完成标准：

```text
漫画库数量变大后，仍然可以方便搜索、筛选、整理和去重。
```

---

# 20. MVP 优先级

最小可用版本建议只做这些：

```text
1. Next.js 本地自托管应用
2. SQLite 数据库
3. 绝对路径形式的 manga 根目录设置
4. 普通目录 / zip / cbz 扫描
5. 漫画列表
6. 漫画详情
7. 垂直无缝阅读器
8. 阅读进度保存
9. 后台基础编辑
10. 标签英文存储 + 中文显示
11. 封面自动选择和手动上传封面
12. 缺失文件检测和路径修复提示
```

第二批再做：

```text
1. 浏览器插件
2. 插件导入漫画元数据
3. 插件元数据关联已有本地漫画
4. 重复导入处理：更新 / 忽略 / 另存
5. OpenList 添加 115 离线任务
6. 云端目录扫描
7. 本地下载
8. 下载任务中心
9. aria2 provider
```

第三批再做：

```text
1. 收藏分类
2. 拖拽排序
3. 阅读队列
4. 自动下一话
5. 自动下一本
6. 缩略图滚动条
```

MVP 必须准备测试夹具：

```text
1. 单目录单章节漫画。
2. 多子目录多章节漫画。
3. zip 单章节漫画。
4. cbz 多章节漫画。
5. 带 cover 图片的漫画。
6. 没有 cover 图片的漫画。
7. 文件名包含中文、日文、空格、括号、数字序号的漫画。
8. 缺失文件场景。
9. 重复文件 hash 场景。
10. 坏 zip 场景。
```

自动测试范围：

```text
1. 扫描器单元测试。
2. 自然排序测试。
3. 封面优先级测试。
4. 标题字段默认值测试。
5. 数据库约束和迁移测试。
6. API 集成测试。
7. 阅读进度保存测试。
```

端到端验收：

```text
1. 在设置页配置漫画根目录。
2. 点击扫描。
3. 漫画列表出现测试漫画。
4. 详情页显示标题、封面、章节、页数。
5. 阅读器可以垂直阅读。
6. 退出后再次进入可以恢复阅读进度。
7. 手动修改 display_title 后，file_title 不变化。
8. 手动上传封面后，封面优先级高于 cover 文件和第一页。
9. 删除漫画记录时，本地原文件不会被删除。
```

---

# 21. 项目关键原则

最终项目要坚持这些原则：

```text
1. 本地数据库是核心，不依赖 OpenList 保存业务历史。
2. 导入与下载解耦：可以先导入元数据，也可以先扫描本地文件，下载只是资源获取方式之一。
3. OpenList 只作为 115 工具层，不参与漫画业务逻辑。
4. 标签保存英文 canonical，前台通过翻译表显示中文。
5. 插件负责采集最准确的网页信息，本地服务负责业务处理。
6. 下载必须由本地服务记录状态，支持失败恢复。
7. 本地文件下载使用临时文件机制，避免半成品入库。
8. 阅读器只做垂直无缝阅读，集中把这个模式做好。
9. 收藏分类不仅是收藏夹，也是连续阅读队列来源。
10. 后台必须重视异常处理、缺失文件、重复文件和路径修复。
11. 删除漫画记录默认不删除真实硬盘文件。
```

---

# 22. 最终一句话总结

本项目最终要实现的是：

```text
一个以本地数据库为核心，通过浏览器插件采集漫画网站信息，借助 OpenList 调用 115 离线下载，再由本地服务下载并归档到本地 manga 目录，最后通过前台网站和连续阅读器进行管理、搜索、收藏和阅读的个人漫画库系统。
```
