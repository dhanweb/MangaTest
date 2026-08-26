# Windows / WSL 路径兼容总体设计

## Architecture Summary

跨平台兼容采用“稳定逻辑身份 + runtime location + 受控解析”的结构：

```text
route / page / component
  -> module application service
  -> local-files runtime path service
  -> root location repository + filesystem adapter
```

业务表继续保存稳定的 `manga_root_id`、`video_root_id` 和 portable relative path。绝对路径属于部署环境配置，不再参与 comic、video 或 local file 的跨平台身份判断。

## Invariants

1. 一个时刻只有一个 MangaTest 后端拥有 SQLite。
2. 跨平台迁移不移动真实媒体文件。
3. `root_id + portable relative path` 是稳定文件身份。
4. 当前 runtime profile 无可用 location 时，root 是 offline/unconfigured，不是“所有文件缺失”。
5. 所有平台路径转换必须声明源方言和目标 profile；禁止用当前平台 `path.resolve` 猜测另一平台路径。
6. 客户端仍只提交实体 ID；页面和视频 API 不接受任意文件系统路径。

## Runtime Profiles

```ts
export const runtimeProfiles = ["windows", "wsl", "linux"] as const;
export type RuntimeProfile = (typeof runtimeProfiles)[number];

export interface RuntimeEnvironment {
  profile: RuntimeProfile;
  platform: NodeJS.Platform;
  wslDistroName: string | null;
}
```

检测顺序：显式 `MANGATEST_PATH_PROFILE`；`win32`；Linux 下 `WSL_DISTRO_NAME`/`WSL_INTEROP`/`/proc/version`；普通 Linux。非法显式值使应用启动失败，不静默回退。

## Data Model

新增：

```text
manga_root_locations
  id TEXT PK
  manga_root_id TEXT FK
  runtime_profile TEXT
  absolute_path TEXT
  verification_status TEXT  -- unverified | available | offline | invalid
  last_verified_at TEXT NULL
  last_error TEXT NULL
  created_at / updated_at
  UNIQUE(manga_root_id, runtime_profile)
  UNIQUE(runtime_profile, absolute_path)

video_root_locations
  与 manga_root_locations 对称
```

迁移阶段保留 `manga_roots.absolute_path`、`video_roots.absolute_path`、`local_files.absolute_path` 和 `video_episodes.absolute_path`，用于旧代码兼容和回滚。新代码的读取真值改为 location + relative path；写入时可同步派生字段，待后续独立 schema 清理任务再决定是否删除。

## Portable Relative Paths

数据库格式始终使用 `/`：

```ts
export type PortableRelativePath = string & { readonly __portableRelativePath: unique symbol };

export function parsePortableRelativePath(input: string): PortableRelativePath;
export function toPortableRelativePath(nativeRelativePath: string): PortableRelativePath;
export function resolvePortableChild(rootAbsolutePath: string, relativePath: PortableRelativePath): string;
```

解析拒绝空字符串、NUL、盘符、UNC、以 `/` 开头、`.`/`..` 段和解析后越界。Windows 大小写策略只用于同一 Windows location 内的比较，不改变数据库中保存的文件名。

## Root Location Service

`modules/local-files` 提供统一合同：

```ts
export type RootLocationState =
  | { status: "available"; absolutePath: string; profile: RuntimeProfile }
  | { status: "unconfigured"; profile: RuntimeProfile }
  | { status: "offline" | "invalid"; absolutePath: string; profile: RuntimeProfile; reason: string };

export interface RootLocationService {
  resolveMangaRoot(rootId: string): Promise<RootLocationState>;
  resolveVideoRoot(rootId: string): Promise<RootLocationState>;
  resolveMangaFile(rootId: string, relativePath: string): Promise<string>;
  resolveVideoFile(rootId: string, relativePath: string): Promise<string>;
}
```

扫描器在 root 不是 `available` 时创建失败/跳过 scan session，但不得执行 missing reconciliation。Reader 和 stream API 返回明确的 404/409 业务错误；后台展示 location 状态和修复入口。

## Migration Flow

```text
stop other instance
  -> inventory and active-download guard
  -> SQLite Backup API
  -> dry-run mapping report
  -> target-path verification
  -> one SQLite transaction
  -> post-migration invariant counts
  -> cache invalidation
  -> first reconciliation scan
```

Dry-run 是纯读操作，输出每个旧 root、推断方言、建议 location、可用性、受影响 local file/episode/finalization 数和不可映射记录。`D:\x` 到 `/mnt/d/x` 只对本地盘符路径生成建议；用户必须在目标 runtime 验证后应用。

迁移事务新增/更新 location，规范化 relative path，并同步 legacy derived absolute fields；不更新实体 ID。历史 operation log 和 metadata sync entry 保留原路径。事务前后的关键表计数和主键集合摘要写入迁移报告。

## Integration Boundaries

- Library/Reader/Media Assets：只消费 resolved current-runtime path。
- PixivDownloader：外部路径先用 `path.win32` 解析到 external Windows root 下的 portable relative path，再交给 root location service。
- Downloads：provider adapter 返回 `{ dialect, path }`；finalization 只接受成功映射到当前 runtime 的路径。
- Video：使用 video root location + episode relative path，保持 video/episode/progress ID。
- Desktop integration：Windows、WSL、Linux 分别实现 open-folder adapter；PotPlayer 暴露 capability 结果。

## Compatibility and Rollback

- 旧数据库首次启动只 backfill 当前 profile location，不自动生成另一 profile 的有效映射。
- 新代码在 backfill 后仍同步 legacy absolute columns，因此回滚到迁移前版本时可继续读取原 profile。
- 迁移跨 profile 前必须导出 backup；失败后停止新实例并恢复 backup。
- 不支持 Windows/WSL 同时打开同一 SQLite，也不以 `\\wsl$` 或 `/mnt/d` 共享 WAL 数据库作为部署方案。

## Delivery Boundaries

1. `08-26-portable-manga-paths` 交付完整可用的漫画核心和迁移能力。
2. `08-26-cross-platform-path-integrations` 在第一个子任务合同稳定后覆盖所有剩余本地路径消费者。
3. 父任务执行跨子任务验收、真实 Windows/WSL dry-run 和恢复演练。
