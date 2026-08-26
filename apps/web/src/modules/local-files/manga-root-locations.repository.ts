import { asc, and, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { bootstrapDatabase, getDb, mangaRootLocations } from "@/modules/core/db";
import {
  type RuntimeProfile,
} from "@/modules/core/runtime-paths";

export type MangaRootLocationStatus = "unverified" | "available" | "offline" | "invalid";

export interface MangaRootLocationRecord {
  id: string;
  mangaRootId: string;
  runtimeProfile: RuntimeProfile;
  absolutePath: string;
  verificationStatus: MangaRootLocationStatus;
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MangaRootLocationUpsert {
  id?: string;
  mangaRootId: string;
  runtimeProfile: RuntimeProfile;
  absolutePath: string;
  verificationStatus?: MangaRootLocationStatus;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
}

export interface MangaRootLocationRepository {
  getForProfile(mangaRootId: string, runtimeProfile: RuntimeProfile): MangaRootLocationRecord | null;
  listForRoot(mangaRootId: string): MangaRootLocationRecord[];
  upsert(input: MangaRootLocationUpsert): MangaRootLocationRecord;
  markVerification(input: {
    id: string;
    verificationStatus: Exclude<MangaRootLocationStatus, "unverified">;
    lastVerifiedAt?: string | null;
    lastError?: string | null;
  }): MangaRootLocationRecord;
}

export function createMangaRootLocationRepository(): MangaRootLocationRepository {
  return {
    getForProfile(mangaRootId, runtimeProfile) {
      bootstrapDatabase();
      const db = getDb();
      const row = db
        .select()
        .from(mangaRootLocations)
        .where(and(eq(mangaRootLocations.mangaRootId, mangaRootId), eq(mangaRootLocations.runtimeProfile, runtimeProfile)))
        .get();

      return row ? toRecord(row) : null;
    },

    listForRoot(mangaRootId) {
      bootstrapDatabase();
      const db = getDb();
      return db
        .select()
        .from(mangaRootLocations)
        .where(eq(mangaRootLocations.mangaRootId, mangaRootId))
        .orderBy(asc(mangaRootLocations.runtimeProfile))
        .all()
        .map(toRecord);
    },

    upsert(input) {
      bootstrapDatabase();
      const db = getDb();
      const absolutePath = normalizeAbsolutePathForProfile(input.absolutePath, input.runtimeProfile);
      const now = new Date().toISOString();
      const existingAtPath = db
        .select({ id: mangaRootLocations.id })
        .from(mangaRootLocations)
        .where(
          and(
            eq(mangaRootLocations.runtimeProfile, input.runtimeProfile),
            eq(mangaRootLocations.absolutePath, absolutePath),
            ne(mangaRootLocations.mangaRootId, input.mangaRootId),
          ),
        )
        .get();

      if (existingAtPath) {
        throw new Error("这个运行环境路径已经被另一个漫画根目录使用。");
      }

      db.insert(mangaRootLocations)
        .values({
          id: input.id ?? randomUUID(),
          mangaRootId: input.mangaRootId,
          runtimeProfile: input.runtimeProfile,
          absolutePath,
          verificationStatus: input.verificationStatus ?? "unverified",
          lastVerifiedAt: input.lastVerifiedAt ?? null,
          lastError: input.lastError ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [mangaRootLocations.mangaRootId, mangaRootLocations.runtimeProfile],
          set: {
            absolutePath,
            verificationStatus: input.verificationStatus ?? "unverified",
            lastVerifiedAt: input.lastVerifiedAt ?? null,
            lastError: input.lastError ?? null,
            updatedAt: now,
          },
        })
        .run();

      const row = db
        .select()
        .from(mangaRootLocations)
        .where(and(eq(mangaRootLocations.mangaRootId, input.mangaRootId), eq(mangaRootLocations.runtimeProfile, input.runtimeProfile)))
        .get();

      if (!row) {
        throw new Error("保存漫画根目录运行位置失败。");
      }

      return toRecord(row);
    },

    markVerification(input) {
      bootstrapDatabase();
      const db = getDb();
      const now = new Date().toISOString();
      db.update(mangaRootLocations)
        .set({
          verificationStatus: input.verificationStatus,
          lastVerifiedAt: input.lastVerifiedAt ?? now,
          lastError: input.lastError ?? null,
          updatedAt: now,
        })
        .where(eq(mangaRootLocations.id, input.id))
        .run();

      const row = db.select().from(mangaRootLocations).where(eq(mangaRootLocations.id, input.id)).get();
      if (!row) {
        throw new Error("漫画根目录运行位置不存在。");
      }

      return toRecord(row);
    },
  };
}

export function normalizeAbsolutePathForProfile(input: string, runtimeProfile: RuntimeProfile) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("漫画根目录运行位置不能为空。");
  }

  const isAbsolute = runtimeProfile === "windows" ? path.win32.isAbsolute(trimmed) : path.posix.isAbsolute(trimmed);
  if (!isAbsolute) {
    throw new Error("漫画根目录运行位置必须是对应运行环境的绝对路径。");
  }

  return runtimeProfile === "windows" ? path.win32.normalize(trimmed) : path.posix.normalize(trimmed);
}

function toRecord(row: typeof mangaRootLocations.$inferSelect): MangaRootLocationRecord {
  return {
    id: row.id,
    mangaRootId: row.mangaRootId,
    runtimeProfile: row.runtimeProfile,
    absolutePath: row.absolutePath,
    verificationStatus: row.verificationStatus,
    lastVerifiedAt: row.lastVerifiedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
