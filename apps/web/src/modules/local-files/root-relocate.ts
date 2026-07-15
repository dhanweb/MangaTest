import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { validateAbsolutePath } from "./path-safety";

export interface RootRelocatePathValidation {
  isValid: boolean;
  normalizedSource: string | null;
  normalizedDestination: string | null;
  reason: string | null;
}

export interface RootRelocateMoveResult {
  movedEntryCount: number;
  destinationPath: string;
  sourcePath: string;
}

function isPathInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validateRootRelocatePaths(input: {
  sourcePath: string;
  destinationPath: string;
}): RootRelocatePathValidation {
  const source = validateAbsolutePath(input.sourcePath);
  const destination = validateAbsolutePath(input.destinationPath);

  if (!source.isValid || !source.normalizedPath) {
    return {
      isValid: false,
      normalizedSource: null,
      normalizedDestination: null,
      reason: source.reason ?? "当前路径无效。",
    };
  }

  if (!destination.isValid || !destination.normalizedPath) {
    return {
      isValid: false,
      normalizedSource: source.normalizedPath,
      normalizedDestination: null,
      reason: destination.reason ?? "新路径无效。",
    };
  }

  if (source.normalizedPath === destination.normalizedPath) {
    return {
      isValid: false,
      normalizedSource: source.normalizedPath,
      normalizedDestination: destination.normalizedPath,
      reason: "新路径不能与当前路径相同。",
    };
  }

  if (
    isPathInside(source.normalizedPath, destination.normalizedPath) ||
    isPathInside(destination.normalizedPath, source.normalizedPath)
  ) {
    return {
      isValid: false,
      normalizedSource: source.normalizedPath,
      normalizedDestination: destination.normalizedPath,
      reason: "新旧路径不能互相嵌套，否则会破坏目录迁移。",
    };
  }

  return {
    isValid: true,
    normalizedSource: source.normalizedPath,
    normalizedDestination: destination.normalizedPath,
    reason: null,
  };
}

export async function moveMangaRootContents(input: {
  sourcePath: string;
  destinationPath: string;
}): Promise<RootRelocateMoveResult> {
  const validation = validateRootRelocatePaths(input);
  if (!validation.isValid || !validation.normalizedSource || !validation.normalizedDestination) {
    throw new Error(validation.reason ?? "路径无效。");
  }

  const sourcePath = validation.normalizedSource;
  const destinationPath = validation.normalizedDestination;

  const sourceStat = await stat(sourcePath).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new Error("当前系统目录不存在或不是文件夹。");
  }

  const destinationStat = await stat(destinationPath).catch(() => null);
  if (destinationStat && !destinationStat.isDirectory()) {
    throw new Error("目标路径已存在且不是文件夹。");
  }

  await mkdir(destinationPath, { recursive: true });

  const existing = await readdir(destinationPath);
  if (existing.length > 0) {
    throw new Error("目标目录不是空目录。请选择空目录或新路径，避免覆盖已有文件。");
  }

  const entries = await readdir(sourcePath, { withFileTypes: true });
  let movedEntryCount = 0;

  for (const entry of entries) {
    const from = path.join(sourcePath, entry.name);
    const to = path.join(destinationPath, entry.name);

    try {
      await rename(from, to);
    } catch {
      await cp(from, to, { recursive: true, errorOnExist: true, force: false });
      await rm(from, { recursive: true, force: true });
    }

    movedEntryCount += 1;
  }

  return {
    movedEntryCount,
    destinationPath,
    sourcePath,
  };
}

export function rewritePathUnderRoot(input: {
  absolutePath: string;
  oldRoot: string;
  newRoot: string;
}): string | null {
  const absolutePath = path.normalize(input.absolutePath);
  const oldRoot = path.normalize(input.oldRoot);
  const newRoot = path.normalize(input.newRoot);

  if (absolutePath === oldRoot) {
    return newRoot;
  }

  const relative = path.relative(oldRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return path.join(newRoot, relative);
}
