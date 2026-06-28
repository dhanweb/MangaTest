"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Box, Container, Text } from "@mantine/core";
import { ArrowLeft } from "lucide-react";
import { ComicDetailView } from "@/components/ComicDetailView";
import { SiteHeader } from "@/components/SiteHeader";
import { getComic } from "@/lib/mock-data";

export default function ComicDetailPage() {
  const params = useParams<{ id: string }>();
  const comic = getComic(params.id);

  if (!comic) {
    return (
      <>
        <SiteHeader active="library" />
        <Container size={1200} px={16} py={32}>
          <Box
            component={Link}
            href="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 22, color: "var(--mantine-color-ink-7)", textDecoration: "none" }}
          >
            <ArrowLeft size={16} />
            返回列表
          </Box>
          <Box py={48} style={{ borderRadius: 14, background: "white", textAlign: "center" }}>
            <Text component="h1" size="xl" fw={700}>没有找到这本漫画</Text>
            <Text size="sm" c="ink.5">原型数据里暂时没有这个漫画 ID。</Text>
          </Box>
        </Container>
      </>
    );
  }

  return (
    <>
      <SiteHeader active="library" />
      <Container size={1200} px={16} py={30} pb={64}>
        <Box
          component={Link}
          href="/"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 22, color: "var(--mantine-color-ink-7)", textDecoration: "none", fontSize: 14 }}
        >
          <ArrowLeft size={16} />
          返回列表
        </Box>
        <ComicDetailView comic={comic} />
      </Container>
    </>
  );
}
