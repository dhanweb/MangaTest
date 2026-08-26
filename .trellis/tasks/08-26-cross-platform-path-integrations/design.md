# 跨平台外部路径集成设计

## Provider Path Contract

```ts
export type PathDialect = "windows" | "wsl" | "linux";
export interface ExternalFilePath { dialect: PathDialect; value: string }
```

Downloads adapters 产生 provider path；应用层必须通过 location translator 转为当前 runtime path。Dialect 缺失或转换越界返回业务错误，不能调用当前平台 `path.resolve` 猜测。

## PixivDownloader

Pixiv SQLite 文件位置是当前 runtime 可访问路径；`artworks.folder`/`move_folder` 内容仍按 Windows 方言解释。Resolver 用 Windows root location 计算 portable relative path，再用当前 profile manga location 检查磁盘和匹配 `local_files(manga_root_id, relative_path)`。长期 `site + sourceId` 仍优先。

## Video

新增 `video_root_locations`，backfill 和 manga root location 对称。Video scan/stream/poster/PotPlayer 通过 `videoRootId + episode.relativePath` 解析。Legacy episode absolute path 保留为派生兼容字段。

## Desktop Capabilities

```ts
export interface DesktopCapability {
  supported: boolean;
  mode: "native" | "wsl_bridge" | "unsupported";
  reason: string | null;
}
```

Windows 使用 `cmd /c start`；WSL 使用验证后的 Windows path 调用 `explorer.exe`；普通 Linux 使用 `xdg-open`。PotPlayer Windows native；WSL bridge 需要 `.exe` 可访问和媒体 WSL path 可转换为 Windows path。

## Migration

Video roots/episodes 和 completed download finalizations 可以通过 root + relative path 映射。Active transfer temp paths 属于运行环境，无法安全转换即成为 blocker。Path-valued settings 按 profile 保存，历史记录不重写。
