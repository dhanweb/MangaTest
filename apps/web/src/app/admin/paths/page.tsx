import { createMangaRootRepository } from "@/modules/library/manga-roots.repository";
import { createScanSessionRepository } from "@/modules/library/scan-sessions.repository";

import { PathsPanel } from "./paths-panel";

export const dynamic = "force-dynamic";

export default async function AdminPathsPage() {
  const mangaRoots = await createMangaRootRepository().listWithStats();
  const scanSessions = await createScanSessionRepository().listRecent();

  return <PathsPanel mangaRoots={mangaRoots} scanSessions={scanSessions} />;
}
