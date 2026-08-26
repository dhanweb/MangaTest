import { stat as defaultStat } from "node:fs/promises";

import { eq } from "drizzle-orm";

import { bootstrapDatabase, getDb, mangaRoots } from "@/modules/core/db";
import {
  detectCurrentRuntimeEnvironment,
  type RuntimeEnvironment,
  type RuntimeProfile,
} from "@/modules/core/runtime-paths";

import {
  createMangaRootLocationRepository,
  type MangaRootLocationRecord,
  type MangaRootLocationRepository,
} from "./manga-root-locations.repository";
import { parsePortableRelativePath, resolvePortableChild } from "./portable-relative-path";

export type RootLocationErrorCode = "profile_unconfigured" | "root_offline" | "root_invalid" | "relative_path_invalid" | "path_escape";

export class RootLocationError extends Error {
  constructor(
    public readonly code: RootLocationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RootLocationError";
  }
}

export type RootLocationState =
  | { status: "available"; absolutePath: string; profile: RuntimeProfile }
  | { status: "unconfigured"; profile: RuntimeProfile }
  | { status: "offline" | "invalid"; absolutePath: string; profile: RuntimeProfile; reason: string };

export interface RootLocationService {
  resolveMangaRoot(rootId: string): Promise<RootLocationState>;
  resolveMangaFile(rootId: string, relativePath: string): Promise<string>;
}

export function createRootLocationService(input?: {
  environment?: RuntimeEnvironment;
  repository?: MangaRootLocationRepository;
  stat?: typeof defaultStat;
}): RootLocationService {
  const environment = input?.environment ?? detectCurrentRuntimeEnvironment();
  const repository = input?.repository ?? createMangaRootLocationRepository();
  const stat = input?.stat ?? defaultStat;

  return {
    async resolveMangaRoot(rootId) {
      bootstrapDatabase();
      const db = getDb();
      const root = db.select({ id: mangaRoots.id }).from(mangaRoots).where(eq(mangaRoots.id, rootId)).get();
      if (!root) {
        throw new RootLocationError("profile_unconfigured", "找不到漫画根目录。");
      }

      const location = repository.getForProfile(rootId, environment.profile);
      if (!location) {
        return { status: "unconfigured", profile: environment.profile };
      }

      const info = await stat(location.absolutePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES") {
          return null;
        }
        throw error;
      });

      if (!info) {
        repository.markVerification({
          id: location.id,
          verificationStatus: "offline",
          lastError: "根目录不存在、未挂载或当前进程无权访问。",
        });
        return {
          status: "offline",
          absolutePath: location.absolutePath,
          profile: environment.profile,
          reason: "根目录不存在、未挂载或当前进程无权访问。",
        };
      }

      if (!info.isDirectory()) {
        const reason = "配置的路径不是目录。";
        repository.markVerification({ id: location.id, verificationStatus: "invalid", lastError: reason });
        return { status: "invalid", absolutePath: location.absolutePath, profile: environment.profile, reason };
      }

      repository.markVerification({ id: location.id, verificationStatus: "available" });
      return { status: "available", absolutePath: location.absolutePath, profile: environment.profile };
    },

    async resolveMangaFile(rootId, relativePath) {
      const root = await this.resolveMangaRoot(rootId);
      if (root.status !== "available") {
        throw new RootLocationError(
          root.status === "unconfigured" ? "profile_unconfigured" : root.status === "offline" ? "root_offline" : "root_invalid",
          root.status === "unconfigured" ? "当前运行环境没有配置漫画根目录位置。" : root.reason,
        );
      }

      let portablePath;
      try {
        portablePath = parsePortableRelativePath(relativePath.replaceAll("\\", "/"));
      } catch {
        throw new RootLocationError("relative_path_invalid", "本地文件相对路径无效。");
      }

      try {
        return resolvePortableChild(root.absolutePath, portablePath);
      } catch {
        throw new RootLocationError("path_escape", "本地文件路径超出漫画根目录范围。");
      }
    },
  };
}

export function getMangaRootLocation(rootId: string, runtimeProfile: RuntimeProfile): MangaRootLocationRecord | null {
  return createMangaRootLocationRepository().getForProfile(rootId, runtimeProfile);
}
