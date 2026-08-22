import { notFound } from "next/navigation";

import { createVideoRepository } from "@/modules/video-library";

import { VideoAdminDetailPanel } from "./video-admin-detail-panel";

export const dynamic = "force-dynamic";

export default async function AdminVideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await createVideoRepository().getDetail(id);
  if (!video) notFound();
  return <VideoAdminDetailPanel video={video} />;
}
