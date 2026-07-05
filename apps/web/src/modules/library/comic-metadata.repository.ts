import { eq } from "drizzle-orm";

import { bootstrapDatabase, comics, getDb } from "@/modules/core/db";
import { normalizeOptionalTitle, normalizeSortTitle } from "@/modules/library/title-utils";

export interface ComicMetadataUpdateInput {
  displayTitle: string;
  metadataQueryTitle?: string | null;
  originalTitle?: string | null;
}

export interface ComicMetadataRecord {
  id: string;
  displayTitle: string;
  fileTitle: string;
  metadataQueryTitle: string | null;
  originalTitle: string | null;
  sortTitle: string;
  updatedAt: string;
}

export interface ComicMetadataRepository {
  updateMetadata(comicId: string, input: ComicMetadataUpdateInput): Promise<ComicMetadataRecord>;
}

export function createComicMetadataRepository(): ComicMetadataRepository {
  return {
    async updateMetadata(comicId, input) {
      bootstrapDatabase();

      const db = getDb();
      const existing = db
        .select({
          id: comics.id,
          fileTitle: comics.fileTitle,
        })
        .from(comics)
        .where(eq(comics.id, comicId))
        .get();

      if (!existing) {
        throw new Error("找不到漫画记录。");
      }

      const displayTitle = input.displayTitle.trim();

      if (!displayTitle) {
        throw new Error("展示标题不能为空。");
      }

      const now = new Date().toISOString();
      const metadata = {
        displayTitle,
        metadataQueryTitle: normalizeOptionalTitle(input.metadataQueryTitle),
        originalTitle: normalizeOptionalTitle(input.originalTitle),
        sortTitle: normalizeSortTitle(displayTitle),
        updatedAt: now,
      };

      db.update(comics).set(metadata).where(eq(comics.id, comicId)).run();

      return {
        id: existing.id,
        fileTitle: existing.fileTitle,
        ...metadata,
      };
    },
  };
}
