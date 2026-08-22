import { createVideoRepository } from "@/modules/video-library";

import { VideosPanel } from "./videos-panel";

export const dynamic = "force-dynamic";

export default async function AdminVideosPage() {
  const videos = await createVideoRepository().listAdminRows();
  return <VideosPanel videos={videos} />;
}
