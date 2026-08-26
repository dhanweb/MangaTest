import { randomUUID } from "node:crypto";
import path from "node:path";

import { DEFAULT_SCAN_MODE } from "@/modules/core/config";
import type { RuntimeProfile } from "@/modules/core/runtime-paths";
import type { MangaRootLocationRecord } from "@/modules/local-files/manga-root-locations.repository";
import { validateAbsolutePath } from "@/modules/local-files/path-safety";

export type MangaRootKind = "user" | "system" | "pixiv";

export interface MangaRootDraft {
  absolutePath: string;
  displayName?: string;
  kind?: MangaRootKind;
}

export interface MangaRootRecord {
  id: string;
  absolutePath: string;
  displayName: string | null;
  scanMode: "children_as_comics";
  kind: MangaRootKind;
  isEnabled: boolean;
}

export interface MangaRootWithStats extends MangaRootRecord {
  comicCount: number;
  lastScanSessionId: string | null;
  runtimeProfile: RuntimeProfile;
  currentLocation: MangaRootLocationRecord | null;
  locations: MangaRootLocationRecord[];
}

export function createMangaRootRecord(input: MangaRootDraft): MangaRootRecord {
  const validation = validateAbsolutePath(input.absolutePath);
  if (!validation.isValid || !validation.normalizedPath) {
    throw new Error(validation.reason ?? "漫画根目录无效。");
  }
  return {
    id: randomUUID(),
    absolutePath: validation.normalizedPath,
    displayName: input.displayName?.trim() || null,
    scanMode: DEFAULT_SCAN_MODE,
    kind: input.kind ?? "user",
    isEnabled: true,
  };
}

export const SYSTEM_ROOT_RELATIVE_PATH = "manga_store";

export function getDefaultSystemRootPath(projectRoot?: string) {
  const base = projectRoot ?? process.cwd();
  return path.resolve(base, SYSTEM_ROOT_RELATIVE_PATH);
}
