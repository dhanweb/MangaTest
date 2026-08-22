import { Box, Container, Text } from "@mantine/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { VideoDetailView } from "@/components/video-detail-view";
import { createVideoRepository } from "@/modules/video-library";

export const dynamic = "force-dynamic";

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await createVideoRepository().getDetail(id);
  if (!video) return <><SiteHeader active="videos" /><Container size={1200} px={16} py={32}><Link href="/videos" style={{ display: "inline-flex", gap: 6, color: "var(--mantine-color-ink-7)", textDecoration: "none" }}><ArrowLeft size={16} /> 返回视频库</Link><Box py={48} mt={22} style={{ borderRadius: 14, background: "white", textAlign: "center" }}><Text component="h1" size="xl" fw={700}>没有找到这个视频</Text></Box></Container></>;
  return <><SiteHeader active="videos" /><Container size={1200} px={16} py={30} pb={64}><Link href="/videos" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 22, color: "var(--mantine-color-ink-7)", textDecoration: "none", fontSize: 14 }}><ArrowLeft size={16} /> 返回视频库</Link><VideoDetailView video={video} /></Container></>;
}
