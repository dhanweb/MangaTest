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
先入库，再下载。
```

也就是说，浏览器插件采集到漫画信息和磁链后，必须先提交给本地服务，由本地服务创建漫画、资源、下载任务等数据库记录，然后再调用 OpenList 添加 115 离线任务。

不能先把磁链丢给 115，再回头猜它属于哪部漫画。

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

## 5.3 推荐 API 能力

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

## 8.4 本地目录结构

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

## 9.2 hash 的作用

hash 可以理解成文件指纹。

它用于：

```text
判断是不是同一个文件
判断是否重复下载
判断文件是否被修改
判断数据库记录和本地文件是否还能对上
```

例如文件改名后，只要内容没变，hash 仍然一致，可以自动或半自动修复路径。

## 9.3 缺失文件检测

数据库里记录了：

```text
comic_id
resource_id
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

---

# 10. 数据库设计

## 10.1 核心表

推荐核心表：

```text
comic
comic_source
comic_resource
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
chapter
page
```

## 10.2 comic

记录漫画主体信息：

```text
id
title
title_original
title_translated
cover_path
primary_artist
description
status
created_at
updated_at
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

## 10.5 download_task

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
error_message
retry_count
created_at
updated_at
completed_at
```

provider 可以是：

```text
openlist
```

tool 可以是：

```text
115 Cloud
```

## 10.6 cloud_file

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

## 10.7 local_file

记录本地文件：

```text
id
resource_id
local_file_path
file_name
file_size
file_hash
page_count
cover_path
status
created_at
updated_at
```

## 10.8 tag

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

## 10.9 tag_translation

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

前台默认显示中文，后台保留英文原文。

## 10.10 favorite_category

收藏分类表：

```text
id
name
description
default_sort_mode
created_at
updated_at
```

## 10.11 favorite_item

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

## 10.12 reading_progress

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

## 10.13 reading_queue

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
删除
重新扫描
重新匹配
重新生成封面
重新生成缩略图
修复路径
批量操作
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
后台需要登录
插件调用本地服务需要 API Token
默认只允许 localhost 访问
外网访问需要手动开启
OpenList token / 115 token / cookie 不暴露给前台
敏感配置加密或至少不明文展示
关键操作记录日志
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
本地 manga 目录扫描
漫画列表
漫画详情
垂直无缝阅读器
阅读进度保存
基础标签
基础搜索
后台漫画管理
```

完成标准：

```text
手动放入漫画文件后，系统可以扫描出来
可以生成封面
可以进入详情页
可以垂直无缝阅读
可以保存阅读进度
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
编辑标签
编辑作者
修改封面
重新扫描
检测缺失文件
计算 hash
修复路径
批量操作
标签翻译表
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
1. 本地服务
2. SQLite 数据库
3. 本地 manga 目录扫描
4. 漫画列表
5. 漫画详情
6. 垂直无缝阅读器
7. 阅读进度保存
8. 后台基础编辑
9. 标签英文存储 + 中文显示
```

第二批再做：

```text
1. 浏览器插件
2. 插件导入漫画元数据
3. OpenList 添加 115 离线任务
4. 云端目录扫描
5. 本地下载
6. 下载任务中心
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

---

# 21. 项目关键原则

最终项目要坚持这些原则：

```text
1. 本地数据库是核心，不依赖 OpenList 保存业务历史。
2. 先入库，再下载，避免磁链和漫画信息断链。
3. OpenList 只作为 115 工具层，不参与漫画业务逻辑。
4. 标签保存英文 canonical，前台通过翻译表显示中文。
5. 插件负责采集最准确的网页信息，本地服务负责业务处理。
6. 下载必须由本地服务记录状态，支持失败恢复。
7. 本地文件下载使用临时文件机制，避免半成品入库。
8. 阅读器只做垂直无缝阅读，集中把这个模式做好。
9. 收藏分类不仅是收藏夹，也是连续阅读队列来源。
10. 后台必须重视异常处理、缺失文件、重复文件和路径修复。
```

---

# 22. 最终一句话总结

本项目最终要实现的是：

```text
一个以本地数据库为核心，通过浏览器插件采集漫画网站信息，借助 OpenList 调用 115 离线下载，再由本地服务下载并归档到本地 manga 目录，最后通过前台网站和连续阅读器进行管理、搜索、收藏和阅读的个人漫画库系统。
```
