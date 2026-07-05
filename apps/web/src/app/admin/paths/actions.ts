"use server";

import { revalidatePath } from "next/cache";

import { createAndScanMangaRoot } from "@/modules/library/create-and-scan-manga-root";
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
