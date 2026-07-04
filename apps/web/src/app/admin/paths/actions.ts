"use server";

import { revalidatePath } from "next/cache";

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
    await createMangaRootRepository().create({
      absolutePath,
      displayName,
    });
    revalidatePath("/admin/paths");

    return {
      status: "success",
      message: "漫画根目录已保存。",
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
