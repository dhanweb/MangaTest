import { eq } from "drizzle-orm";

import { bootstrapDatabase, comics, getDb, localFiles } from "@/modules/core/db";

export interface FileMaintenanceIssueRecord {
  id: string;
  comicId: string | null;
  comicTitle: string;
  issueType: "missing";
  filePath: string;
  expectedSize: string;
  detail: string;
  detectedAt: string;
}

export interface FileMaintenanceRepository {
  listIssues(): Promise<FileMaintenanceIssueRecord[]>;
}

export function createFileMaintenanceRepository(): FileMaintenanceRepository {
  return {
    async listIssues() {
      bootstrapDatabase();
      const db = getDb();
      const rows = db
        .select({
          id: localFiles.id,
          comicId: localFiles.comicId,
          comicTitle: comics.displayTitle,
          filePath: localFiles.absolutePath,
          sizeBytes: localFiles.sizeBytes,
          missingSince: localFiles.missingSince,
          updatedAt: localFiles.updatedAt,
        })
        .from(localFiles)
        .leftJoin(comics, eq(comics.id, localFiles.comicId))
        .where(eq(localFiles.isMissing, true))
        .all();

      return rows.map((row) => ({
        id: row.id,
        comicId: row.comicId,
        comicTitle: row.comicTitle ?? "未关联漫画",
        issueType: "missing" as const,
        filePath: row.filePath,
        expectedSize: formatBytes(row.sizeBytes),
        detail: "文件路径不存在，可能是磁盘已断开连接或文件被移动。",
        detectedAt: row.missingSince ?? row.updatedAt,
      }));
    },
  };
}

function formatBytes(value: number | null) {
  if (!value) {
    return "-";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${Math.round(value / 1024 / 1024)} MB`;
  }

  return `${Math.round(value / 1024)} KB`;
}
