import { createMangaRootRepository } from "./manga-roots.repository";
import type { MangaRootDraft, MangaRootRecord } from "./manga-roots";
import { scanMangaRoot, type LibraryScanResult } from "./scan-library-root";

export interface CreateAndScanMangaRootResult {
  root: MangaRootRecord;
  scanError: string | null;
  scanResult: LibraryScanResult | null;
}

export async function createAndScanMangaRoot(input: MangaRootDraft): Promise<CreateAndScanMangaRootResult> {
  const root = await createMangaRootRepository().create(input);

  try {
    return {
      root,
      scanError: null,
      scanResult: await scanMangaRoot(root.id),
    };
  } catch (error) {
    return {
      root,
      scanError: error instanceof Error ? error.message : "自动扫描失败。",
      scanResult: null,
    };
  }
}
