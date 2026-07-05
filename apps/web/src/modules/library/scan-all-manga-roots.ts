import type { MangaRootRecord } from "./manga-roots";
import { createMangaRootRepository } from "./manga-roots.repository";
import { scanMangaRoot, type LibraryScanResult } from "./scan-library-root";

export interface ScanAllMangaRootItem {
  mangaRootId: string;
  displayName: string | null;
  absolutePath: string;
  status: "completed" | "failed";
  result: LibraryScanResult | null;
  error: string | null;
}

export interface ScanAllMangaRootsResult {
  enabledRootCount: number;
  scannedRootCount: number;
  failedRootCount: number;
  addedCount: number;
  missingCount: number;
  duplicateCandidateCount: number;
  recoverableCount: number;
  pageCount: number;
  roots: ScanAllMangaRootItem[];
}

export async function scanAllEnabledMangaRoots(): Promise<ScanAllMangaRootsResult> {
  const enabledRoots = (await createMangaRootRepository().list()).filter((root) => root.isEnabled);
  const summary = createEmptyScanAllResult(enabledRoots.length);

  for (const root of enabledRoots) {
    try {
      const result = await scanMangaRoot(root.id);

      summary.scannedRootCount += 1;
      summary.addedCount += result.addedCount;
      summary.missingCount += result.missingCount;
      summary.duplicateCandidateCount += result.duplicateCandidateCount;
      summary.recoverableCount += result.recoverableCount;
      summary.pageCount += result.pageCount;
      summary.roots.push(createScanAllRootItem(root, "completed", result, null));
    } catch (error) {
      summary.failedRootCount += 1;
      summary.roots.push(createScanAllRootItem(root, "failed", null, error instanceof Error ? error.message : "扫描失败。"));
    }
  }

  return summary;
}

function createEmptyScanAllResult(enabledRootCount: number): ScanAllMangaRootsResult {
  return {
    enabledRootCount,
    scannedRootCount: 0,
    failedRootCount: 0,
    addedCount: 0,
    missingCount: 0,
    duplicateCandidateCount: 0,
    recoverableCount: 0,
    pageCount: 0,
    roots: [],
  };
}

function createScanAllRootItem(
  root: MangaRootRecord,
  status: ScanAllMangaRootItem["status"],
  result: LibraryScanResult | null,
  error: string | null,
): ScanAllMangaRootItem {
  return {
    mangaRootId: root.id,
    displayName: root.displayName,
    absolutePath: root.absolutePath,
    status,
    result,
    error,
  };
}
