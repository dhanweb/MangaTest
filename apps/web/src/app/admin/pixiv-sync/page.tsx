import { createMangaRootRepository } from "@/modules/library/manga-roots.repository";

import { PixivSyncPanel } from "./pixiv-sync-panel";

export const dynamic = "force-dynamic";

export default async function AdminPixivSyncPage() {
  const mangaRoots = await createMangaRootRepository().list();

  return <PixivSyncPanel mangaRoots={mangaRoots} />;
}
