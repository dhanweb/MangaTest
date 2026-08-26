# 跨平台外部路径集成

## Goal

在 portable manga path 合同稳定后，覆盖 MangaTest 当前所有其余本地路径消费者，使 PixivDownloader、downloads/aria2、video-library、资源管理器和 PotPlayer 在 Windows 或 WSL 单后端部署下具有明确、可验证且不会猜错路径的行为。

## Requirements

- PixivDownloader 外部 Windows 路径解析为逻辑 manga root + portable relative path，再映射到当前 runtime location。
- Downloads provider path 必须携带明确 dialect/profile；无法映射时阻止 finalization。
- video root 使用与 manga root 等价的 location 模型，episode 稳定身份为 root ID + portable relative path。
- Windows/WSL/Linux 打开目录使用独立 adapter。
- PotPlayer 暴露 runtime capability；WSL 仅在 Windows executable 和 media path 可安全转换时启用。
- 迁移 video roots/episodes、completed finalizations 和 path-valued settings 时保留业务 ID 与历史记录。
- active downloads 的 runtime-specific temp path 不可安全转换时阻止跨平台迁移。

## Acceptance Criteria

- [ ] Pixiv 同一作品在 Windows/WSL 下匹配相同 comic/source identity。
- [ ] WSL 中 Pixiv runtime path 不经过 `path.win32.resolve`。
- [ ] Windows aria2 path、WSL aria2 path 和 builtin HTTP path 有独立测试；未知 dialect 阻止 finalization。
- [ ] video/video-episode/tag/merge/progress ID 在 location 迁移后不变，Windows 文件可从 WSL stream。
- [ ] WSL open-folder 将 `/mnt/d/...` 转换后调用 `explorer.exe`；普通 Linux 不调用 Windows 程序。
- [ ] PotPlayer capability 在 Windows、可桥接 WSL和不支持环境返回明确结果。
- [ ] full test/typecheck/lint/build 和双平台 smoke test 通过。

## Dependency

- 必须等待 `08-26-portable-manga-paths` 的 RuntimeProfile、PortableRelativePath 和 location resolver 合同通过审查。
