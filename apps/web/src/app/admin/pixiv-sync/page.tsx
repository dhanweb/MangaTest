import { ensureConfiguredPixivDownloaderMangaRoot } from "@/modules/metadata-ingest/sources/pixiv-downloader";

import { PixivSyncPanel } from "./pixiv-sync-panel";

export const dynamic = "force-dynamic";

export default async function AdminPixivSyncPage() {
  await ensureConfiguredPixivDownloaderMangaRoot();
  return <PixivSyncPanel />;
}
