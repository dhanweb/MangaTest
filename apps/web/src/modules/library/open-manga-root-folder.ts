import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";

import { bootstrapDatabase } from "@/modules/core/db";

import { createMangaRootRepository } from "./manga-roots.repository";

export type OpenMangaRootFolderResult =
  | {
      ok: true;
      openedPath: string;
      message: string;
    }
  | {
      ok: false;
      code: "root_not_found" | "path_not_found" | "open_failed";
      message: string;
    };

export async function openMangaRootInFileManager(mangaRootId: string): Promise<OpenMangaRootFolderResult> {
  bootstrapDatabase();
  const roots = await createMangaRootRepository().list();
  const root = roots.find((item) => item.id === mangaRootId);
  if (!root) {
    return { ok: false, code: "root_not_found", message: "找不到漫画路径。" };
  }

  const absolutePath = path.resolve(root.absolutePath);
  try {
    await access(absolutePath);
    const info = await stat(absolutePath);
    if (!info.isDirectory()) {
      return { ok: false, code: "path_not_found", message: `路径不是目录：${absolutePath}` };
    }
  } catch {
    return { ok: false, code: "path_not_found", message: `本地路径不存在：${absolutePath}` };
  }

  try {
    await openPathWithSystemDefault(absolutePath);
    return {
      ok: true,
      openedPath: absolutePath,
      message: `已在资源管理器打开：${absolutePath}`,
    };
  } catch (error) {
    return {
      ok: false,
      code: "open_failed",
      message: error instanceof Error ? error.message : "打开文件管理器失败。",
    };
  }
}

function openPathWithSystemDefault(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let child;

    if (platform === "win32") {
      child = spawn("cmd", ["/c", "start", "", targetPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
    } else if (platform === "darwin") {
      child = spawn("open", [targetPath], { detached: true, stdio: "ignore" });
    } else {
      child = spawn("xdg-open", [targetPath], { detached: true, stdio: "ignore" });
    }

    child.on("error", reject);
    child.unref();
    resolve();
  });
}
