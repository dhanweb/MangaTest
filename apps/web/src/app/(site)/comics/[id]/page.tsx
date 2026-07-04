import { Box, Container, Text } from "@mantine/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ComicDetailView } from "@/components/comic-detail-view";
import { SiteHeader } from "@/components/site-header";
import { createComicRepository } from "@/modules/library/comics.repository";

export const dynamic = "force-dynamic";

export default async function ComicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comic = await createComicRepository().getDetail(id);

  if (!comic) {
    return (
      <>
        <SiteHeader active="library" />
        <Container size={1200} px={16} py={32}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 22,
              color: "var(--mantine-color-ink-7)",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={16} />
            返回列表
          </Link>
          <Box py={48} style={{ borderRadius: 14, background: "white", textAlign: "center" }}>
            <Text component="h1" size="xl" fw={700}>
              没有找到这本漫画
            </Text>
            <Text size="sm" c="ink.5">
              当前本地库里没有这个漫画记录。
            </Text>
          </Box>
        </Container>
      </>
    );
  }

  return (
    <>
      <SiteHeader active="library" />
      <Container size={1200} px={16} py={30} pb={64}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 22,
            color: "var(--mantine-color-ink-7)",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          <ArrowLeft size={16} />
          返回列表
        </Link>
        <ComicDetailView comic={comic} />
      </Container>
    </>
  );
}
