import { createMangaRootRepository } from "@/modules/library/manga-roots.repository";
import { ensureConfiguredPixivDownloaderMangaRoot } from "@/modules/metadata-ingest/sources/pixiv-downloader";
import { createScanSessionRepository } from "@/modules/library/scan-sessions.repository";
import { createVideoRootRepository } from "@/modules/video-library";
import { detectCurrentRuntimeEnvironment } from "@/modules/core/runtime-paths";

import { PathsPanel } from "./paths-panel";
import { VideoPathsPanel } from "./video-paths-panel";

export const dynamic = "force-dynamic";

export default async function AdminPathsPage() {
  await ensureConfiguredPixivDownloaderMangaRoot();
  const mangaRoots = await createMangaRootRepository().listWithStats();
  const scanSessions = await createScanSessionRepository().listRecent();
  const videoRoots = await createVideoRootRepository().listWithStats();
  const runtimeProfile = detectCurrentRuntimeEnvironment().profile;

  return <><PathsPanel mangaRoots={mangaRoots} scanSessions={scanSessions} runtimeProfile={runtimeProfile} /><VideoPathsPanel initialRoots={videoRoots} /></>;
}
