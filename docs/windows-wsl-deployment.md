# Windows / WSL 部署与 MangaTest 路径迁移

MangaTest 的 Windows/WSL 支持是“一个活动后端、多个可验证位置”的模型。Windows 后端和 WSL 后端不能同时打开同一个 SQLite 数据库，也不支持通过共享 WAL 文件做实时同步。

## 支持的拓扑

- 同一份数据库中的漫画根目录有稳定的逻辑 ID。
- 每个逻辑根目录可以保存 `windows`、`wsl` 或 `linux` location；location 保存该环境中的绝对路径。
- 本地文件的稳定身份是 `manga_root_id + portable relative_path`，相对路径统一使用 `/`。
- 数据库、应用依赖、生成图片、压缩包列表和临时下载缓存属于当前运行环境；缓存可以在目标环境重新生成。
- WSL 访问 Windows 磁盘时通常使用 `/mnt/<drive>/...`，但只有实际存在并通过验证的路径才可以应用。

## 从 Windows 迁移到 WSL

1. 停止 Windows 后端，确认没有下载传输或其它会写入数据库的任务。
2. 在 `/admin/settings` 导出 SQLite 备份；也保留应用自动创建的迁移备份。
3. 将 SQLite 数据库副本和项目配置复制到 WSL。不要复制正在使用的 `-wal` / `-shm` 文件作为实时数据库。
4. 在 WSL 中按项目要求重新安装依赖，例如运行 `npm ci`；不要直接复用 Windows 的 `node_modules`。
5. 在 WSL 启动后端，设置 `MANGATEST_PATH_PROFILE=wsl`（通常可以省略，让程序自动检测）。
6. 打开 `/admin/paths`，点击“跨环境迁移”。选择 `WSL`，检查每个根目录的建议位置，必要时修正为实际的 `/mnt/<drive>/...` 路径。
7. 生成预览。只有目标目录可访问、没有活动传输且没有不可映射路径时，应用按钮才会启用。
8. 勾选备份确认并应用。此操作只更新 location 和兼容的派生绝对路径，不移动、重命名或删除漫画文件。
9. 先对一个根目录执行扫描，确认已有漫画没有重复创建，再执行其余根目录扫描。
10. 从首页打开一部目录、ZIP 或 CBZ 漫画，确认封面、reader 页面和缩略图正常。

## 从 WSL 迁移到 Windows

流程相同，但在目标 Windows 后端中选择 `Windows`，并把每个 location 设置为实际的 `D:\Library` 或 `C:\Library` 等绝对路径。WSL 的 `/mnt/d/Library` 只是一种建议格式，不能把它直接当作 Windows 文件系统路径使用。

## 迁移前后检查

- 源后端已经停止，且没有活动中的 transfer。
- 每个目标 location 都是目录并且 MangaTest 进程有访问权限。
- 迁移报告中的 root 数量、local file 数量和 invariant ID 摘要符合预期。
- 目标环境首次扫描后，`manga_root_id + relative_path` 没有新增重复 local file。
- `comics`、`local_files`、`chapters`、`pages`、标签和阅读进度 ID 保持不变。
- 缺失文件页面没有把离线根目录误报为大量单文件缺失。

## 回滚

路径迁移不会删除真实漫画文件。若应用后的校验失败或目标 location 配置错误：

1. 停止目标后端。
2. 保留失败后的数据库副本和日志，不要继续扫描。
3. 用迁移前的 SQLite 备份替换目标数据库；如果需要保留目标环境后来产生的数据，先将其另存为独立副本。
4. 恢复正确的依赖和运行 profile，启动后先验证 `/admin/paths`，再扫描。

应用内生成的 cache、reader thumbnails 和 archive file-list 不是业务数据，可以清理后重新生成；不要用清理缓存代替数据库回滚。

## 边界

此阶段只处理漫画库、Reader、封面/缩略图和后台路径管理。PixivDownloader、Downloads/aria2、video-library、资源管理器和 PotPlayer 的外部路径适配属于后续跨平台集成任务。
