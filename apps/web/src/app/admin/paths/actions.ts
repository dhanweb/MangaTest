"use server";

import { revalidatePath } from "next/cache";

import { createAndScanMangaRoot } from "@/modules/library/create-and-scan-manga-root";
import { relocateSystemMangaRoot } from "@/modules/library/relocate-system-manga-root";
import { createMangaRootRepository } from "@/modules/library/manga-roots.repository";
import { scanMangaRoot } from "@/modules/library/scan-library-root";

export interface SaveMangaRootState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function saveMangaRootAction(_state: SaveMangaRootState, formData: FormData): Promise<SaveMangaRootState> {
  const absolutePath = String(formData.get("absolutePath") ?? "");
  const displayName = String(formData.get("displayName") ?? "");

  try {
    const result = await createAndScanMangaRoot({
      absolutePath,
      displayName,
    });
    revalidatePath("/admin/paths");
    revalidatePath("/");

    return {
      status: result.scanError ? "error" : "success",
      message: result.scanError
        ? `漫画根目录已保存，但自动扫描失败：${result.scanError}`
        : `漫画根目录已保存，并已自动扫描新增 ${result.scanResult?.addedCount ?? 0} 本。`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "保存漫画根目录失败。",
    };
  }
}

export async function scanMangaRootAction(formData: FormData) {
  const mangaRootId = String(formData.get("mangaRootId") ?? "");

  if (!mangaRootId) {
    return;
  }

  try {
    await scanMangaRoot(mangaRootId);
  } catch {
    // The scan service records failed sessions for the admin page to show.
  }

  revalidatePath("/admin/paths");
}

export async function updateMangaRootAction(_state: SaveMangaRootState, formData: FormData): Promise<SaveMangaRootState> {
  const id = String(formData.get("mangaRootId") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const isEnabled = formData.get("isEnabled") === "on";

  if (!id) {
    return {
      status: "error",
      message: "缺少漫画根目录 ID。",
    };
  }

  try {
    await createMangaRootRepository().updateSettings({
      id,
      displayName,
      isEnabled,
    });
    revalidatePath("/admin/paths");
    revalidatePath("/");

    return {
      status: "success",
      message: "路径设置已保存。",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "保存路径设置失败。",
    };
  }
}

export async function deleteMangaRootAction(formData: FormData) {
  const id = String(formData.get("mangaRootId") ?? "");

  if (!id) {
    return;
  }

  try {
    await createMangaRootRepository().deleteUnused(id);
  } catch {
    return;
  }

  revalidatePath("/admin/paths");
  revalidatePath("/");
}

export async function relocateSystemMangaRootAction(
  _state: SaveMangaRootState,
  formData: FormData,
): Promise<SaveMangaRootState> {
  const id = String(formData.get("mangaRootId") ?? "");
  const nextAbsolutePath = String(formData.get("nextAbsolutePath") ?? "");
  const moveFiles = formData.get("moveFiles") === "true";

  if (!id) {
    return {
      status: "error",
      message: "缺少漫画根目录 ID。",
    };
  }

  try {
    const result = await relocateSystemMangaRoot({
      mangaRootId: id,
      nextAbsolutePath,
      moveFiles,
    });
    revalidatePath("/admin/paths");
    revalidatePath("/");
    revalidatePath("/admin/files");
    revalidatePath("/admin/comics");

    const successMessage = moveFiles
      ? ("系统目录已迁移到 " + result.toPath + "，移动 " + result.movedEntryCount + " 项，更新 " + result.updatedLocalFileCount + " 条文件记录。")
      : ("系统目录路径已更新为 " + result.toPath + "（未移动文件），更新 " + result.updatedLocalFileCount + " 条文件记录。");

    return {
      status: "success",
      message: successMessage,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "迁移系统目录失败。",
    };
  }
}
