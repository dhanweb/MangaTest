import { randomUUID } from "node:crypto";

import { DEFAULT_SCAN_MODE } from "@/modules/core/config";
import { validateAbsolutePath } from "@/modules/local-files/path-safety";

export interface MangaRootDraft {
  absolutePath: string;
  displayName?: string;
}

export interface MangaRootRecord {
  id: string;
  absolutePath: string;
  displayName: string | null;
  scanMode: "children_as_comics";
  isEnabled: boolean;
}

export interface MangaRootWithStats extends MangaRootRecord {
  comicCount: number;
  lastScanSessionId: string | null;
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
    isEnabled: true,
  };
}
