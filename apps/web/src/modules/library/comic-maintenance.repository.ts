import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { bootstrapDatabase, comics, getDb, operationLogs } from "@/modules/core/db";

export type ComicMaintenanceAction = "hide" | "soft_delete" | "restore";

export interface ComicMaintenanceResult {
  id: string;
  displayTitle: string;
  previousStatus: "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";
  status: "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";
  hiddenAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface ComicMaintenanceRepository {
  changeStatus(comicId: string, action: ComicMaintenanceAction): Promise<ComicMaintenanceResult>;
}

export function createComicMaintenanceRepository(): ComicMaintenanceRepository {
  return {
    async changeStatus(comicId, action) {
      bootstrapDatabase();

      const db = getDb();
      const existing = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          status: comics.status,
          hiddenAt: comics.hiddenAt,
          deletedAt: comics.deletedAt,
        })
        .from(comics)
        .where(eq(comics.id, comicId))
        .get();

      if (!existing) {
        throw new Error("找不到漫画记录。");
      }

      if (action === "hide" && existing.status === "deleted") {
        throw new Error("已软删除的漫画需要先恢复，才能隐藏。");
      }

      const now = new Date().toISOString();
      const nextStatus = action === "hide" ? "hidden" : action === "soft_delete" ? "deleted" : "readable";
      const nextHiddenAt = action === "restore" ? null : action === "hide" ? now : existing.hiddenAt;
      const nextDeletedAt = action === "restore" ? null : action === "soft_delete" ? now : existing.deletedAt;

      db.transaction((tx) => {
        tx.update(comics)
          .set({
            status: nextStatus,
            hiddenAt: nextHiddenAt,
            deletedAt: nextDeletedAt,
            updatedAt: now,
          })
          .where(eq(comics.id, comicId))
          .run();

        tx.insert(operationLogs)
          .values({
            id: randomUUID(),
            operation: action,
            targetType: "comic",
            targetId: comicId,
            summary: operationSummary(action, existing.displayTitle),
            detailJson: JSON.stringify({
              displayTitle: existing.displayTitle,
              previousStatus: existing.status,
              status: nextStatus,
              physicalFilesTouched: false,
            }),
            createdAt: now,
          })
          .run();
      });

      return {
        id: existing.id,
        displayTitle: existing.displayTitle,
        previousStatus: existing.status,
        status: nextStatus,
        hiddenAt: nextHiddenAt,
        deletedAt: nextDeletedAt,
        updatedAt: now,
      };
    },
  };
}

function operationSummary(action: ComicMaintenanceAction, title: string) {
  if (action === "hide") {
    return `隐藏漫画：${title}`;
  }

  if (action === "soft_delete") {
    return `软删除漫画记录：${title}（未删除真实文件）`;
  }

  return `恢复漫画记录：${title}`;
}
