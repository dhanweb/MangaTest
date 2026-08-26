# 可移植漫画路径与无损迁移设计

## Owned Modules

- `modules/core/runtime-paths`：runtime profile 检测和平台方言类型。
- `modules/local-files`：portable relative path、manga root locations、filesystem verification 和 resolved path。
- `modules/library`：migration application service、scan gating 和 reconciliation。
- `modules/reader` / `modules/media-assets`：消费 resolved path。
- `app/admin/paths` / `app/api/admin/path-migration`：状态、dry-run 和 apply UI/API。

## Schema

新增 `manga_root_locations`，每个 `(manga_root_id, runtime_profile)` 唯一。保留 legacy absolute columns。bootstrap migration：为每个现有 root 按当前 runtime profile 插入一条 location；不推测另一 profile 已验证可用。

## Resolver Flow

```text
rootId + database relativePath
  -> load current-profile location
  -> validate portable relative path
  -> resolveSafeChildPath(location.absolutePath, relativePath)
  -> filesystem consumer
```

Resolver 返回 typed error：`profile_unconfigured`、`root_offline`、`root_invalid`、`relative_path_invalid`、`path_escape`。扫描在前三类错误下结束 session，不进入 missing reconciliation。

## Migration Report

Report 包含 runtime source/target profile、backup requirement、root mappings、record counts、unmappable records、active transfer blockers、target verification 和 invariant snapshot。Apply 请求携带 report fingerprint，防止 dry-run 后数据库变化仍套用旧报告。

## Cache Strategy

Archive list key 改为 `localFileId + mtime + size`；reader thumbnail key 使用 `pageId/localFileId + mtime + size + dimensions + usage`。迁移可以删除路径依赖缓存记录和生成文件；缓存不是业务数据。

## Admin Safety

路径页将 location 状态与“物理迁移系统目录”分开。跨平台迁移只增加/切换 profile location，永远不显示“移动文件”选项。Apply 对话框展示 backup filename、目标绝对路径、受影响记录和明确的“不移动真实文件”。
