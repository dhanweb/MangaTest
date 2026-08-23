import fs from "node:fs";
import path from "node:path";

import type { ExternalPixivPathPrefix, PixivPathResolveResult } from "./types";

/**
 * PixivDownloader artworks.folder / move_folder 解析规则：
 *
 * - moved 生效且 move_folder 非空时优先使用移动后路径。
 * - `{0}` 替换为用户配置的下载根目录。
 * - `{N}` (N >= 1) 替换为 path_prefixes 表中 id = N 的路径。
 * - 解析后统一做 Windows 路径规范化（path.resolve）。
 * - 解析结果必须位于下载根目录或某个 path prefix 根目录之内，否则记为路径越界。
 */

const PLACEHOLDER_PATTERN = /\{(\d+)\}/g;
const IS_WINDOWS = process.platform === "win32";

export interface PixivPathResolverConfig {
  downloadRoot: string;
  pathPrefixes: ExternalPixivPathPrefix[];
}

export function createPixivPathResolver(config: PixivPathResolverConfig) {
  const downloadRoot = normalizeToAbsolute(config.downloadRoot);
  const prefixRoots = new Map<number, string>();
  for (const prefix of config.pathPrefixes) {
    prefixRoots.set(prefix.id, normalizeToAbsolute(prefix.path));
  }

  /** 允许解析结果落地的根目录集合：下载根目录 + 所有 path prefix 根目录。 */
  const allowedRoots = [downloadRoot, ...prefixRoots.values()];

  function resolve(artwork: { folder: string; moveFolder: string | null; moved: boolean }): PixivPathResolveResult {
    const useMoveFolder = Boolean(artwork.moved) && Boolean(artwork.moveFolder);
    const template = useMoveFolder ? (artwork.moveFolder as string) : artwork.folder;
    const trimmed = template?.trim() ?? "";

    if (!trimmed) {
      return { ok: false, failure: { kind: "empty_folder" }, usedMoveFolder: useMoveFolder };
    }

    let sawPlaceholder = false;
    let unresolvedPrefix: string | null = null;

    const replaced = trimmed.replace(PLACEHOLDER_PATTERN, (match, digit: string) => {
      const id = Number(digit);
      sawPlaceholder = true;

      if (id === 0) {
        return downloadRoot;
      }

      const prefixPath = prefixRoots.get(id);
      if (!prefixPath) {
        unresolvedPrefix = match;
        return match;
      }

      return prefixPath;
    });

    if (unresolvedPrefix) {
      return {
        ok: false,
        failure: { kind: "unknown_prefix", placeholder: unresolvedPrefix },
        usedMoveFolder: useMoveFolder,
      };
    }

    // 不带占位符的相对路径按下载根目录处理；绝对路径直接规范化。
    const resolved = sawPlaceholder || path.isAbsolute(replaced)
      ? normalizeToAbsolute(replaced)
      : normalizeToAbsolute(path.join(downloadRoot, replaced));

    if (!isInsideAnyRoot(resolved, allowedRoots)) {
      return {
        ok: false,
        failure: { kind: "path_escape", resolvedPath: resolved },
        usedMoveFolder: useMoveFolder,
      };
    }

    let existsOnDisk = false;
    try {
      existsOnDisk = fs.existsSync(resolved);
    } catch {
      existsOnDisk = false;
    }

    return { ok: true, absolutePath: resolved, usedMoveFolder: useMoveFolder, existsOnDisk };
  }

  return { resolve, downloadRoot, allowedRoots };
}

export type PixivPathResolver = ReturnType<typeof createPixivPathResolver>;

/** Windows 语义的路径规范化：统一分隔符并解析 `.` / `..`。 */
export function normalizeToAbsolute(input: string): string {
  const withPlatformSeparators = input.replace(/\//g, "\\");
  const isUnc = /^\\\\[^\\]/.test(withPlatformSeparators);
  const resolved = path.win32.resolve(isUnc ? withPlatformSeparators : withPlatformSeparators.replace(/\\{2,}/, "\\"));
  return resolved;
}

/**
 * 生成用于和 local_files.absolute_path 比较的规范化形式：
 * 小写盘符、正斜杠、去尾斜杠，Windows 下大小写不敏感。
 */
export function normalizePathForComparison(input: string): string {
  let normalized = path.win32.normalize(input.trim()).replace(/\\/g, "/");

  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }

  if (IS_WINDOWS) {
    normalized = normalized.toLowerCase();
  }

  return normalized.replace(/\/+$/, "") || "/";
}

export function isPathInsideRoot(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizePathForComparison(candidate);
  const normalizedRoot = normalizePathForComparison(root);

  if (normalizedCandidate === normalizedRoot) {
    return true;
  }

  return normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function isInsideAnyRoot(candidate: string, roots: string[]): boolean {
  return roots.some((root) => isPathInsideRoot(candidate, root));
}
