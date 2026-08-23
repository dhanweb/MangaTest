"use client";

import { Box, Container, Flex, Group, Text } from "@mantine/core";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { VideoCard } from "@/components/video-card";
import { SiteHeader } from "@/components/site-header";
import { AppButton, AppLink } from "@/components/ui/app-components";
import type { VideoSearchResult, VideoTagFilterRecord } from "@/modules/video-library";
import { namespaceLabel } from "@/modules/tags";

export function VideoLibraryHome({ initialQuery, initialSelectedTags, result, tagFilters }: { initialQuery: string; initialSelectedTags: string[]; result: VideoSearchResult; tagFilters: VideoTagFilterRecord[] }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const selectedTags = initialSelectedTags;
  const groups = useMemo(() => {
    const map = new Map<string, VideoTagFilterRecord[]>();
    for (const tag of tagFilters) map.set(tag.namespace, [...(map.get(tag.namespace) ?? []), tag]);
    return Array.from(map, ([namespace, values]) => ({ namespace, values }));
  }, [tagFilters]);

  function apply(next: { query?: string; tags?: string[]; page?: number }) {
    const params = new URLSearchParams();
    const nextQuery = next.query ?? query;
    const nextTags = next.tags ?? selectedTags;
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (next.page && next.page > 1) params.set("page", String(next.page));
    for (const tag of nextTags) params.append("tag", tag);
    router.push(params.size ? `/videos?${params.toString()}` : "/videos");
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <>
    <SiteHeader active="videos" />
    <Container size={1440} px={16} py={32} pb={56}>
      <Box mb={24}><Text component="h1" size="28px" fw={700} c="pink.5" mb={6} mt={0}>视频库</Text><Text size="sm" c="ink.5">浏览本地视频，按标签和标题快速找到要看的内容。</Text></Box>
      <Box component="form" mb={24} style={{ display: "flex", gap: 12 }} onSubmit={(event) => { event.preventDefault(); apply({ page: 1 }); }}>
        <Box component="label" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minHeight: 42, padding: "0 13px", border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, background: "white" }}>
          <Search size={18} style={{ color: "var(--mantine-color-ink-5)" }} />
          <Box component="input" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="搜索视频名称或标签..." style={{ width: "100%", border: 0, outline: 0, background: "transparent", fontSize: 14 }} />
        </Box>
        <AppButton type="submit">搜索</AppButton>
      </Box>
      <Box component="section" p="lg" mb={24} style={{ border: "1px solid var(--mantine-color-pink-2)", borderRadius: 14, background: "white" }}>
        {groups.length ? groups.map((group) => <Box key={group.namespace} style={{ display: "grid", gridTemplateColumns: "98px minmax(0, 1fr)", gap: 10, alignItems: "center", padding: "8px 0" }}>
          <Text size="13px" ta="right" c="#8d5a6e" fw={700}>{namespaceLabel(group.namespace)}:</Text>
          <Group gap={8} wrap="wrap">{group.values.map((tag) => { const selected = selectedTags.includes(tag.canonical); const nextTags = selected ? selectedTags.filter((value) => value !== tag.canonical) : [...selectedTags, tag.canonical]; return <AppButton key={tag.id} variant={selected ? "filled" : "outline"} size="xs" onClick={() => apply({ page: 1, tags: nextTags })}>{tag.label} ({tag.videoCount})</AppButton>; })}</Group>
        </Box>) : <Text size="sm" c="ink.5">还没有视频标签。可以在后台视频管理中手动维护。</Text>}
      </Box>
      <Flex justify="space-between" mb={24}><Text size="sm" c="ink.5">共 {result.total} 个视频{selectedTags.length ? `，已筛选 ${selectedTags.length} 个标签` : ""}</Text>{selectedTags.length ? <AppButton variant="transparent" size="xs" onClick={() => apply({ page: 1, tags: [] })} leftSection={<X size={14} />}>清除筛选</AppButton> : null}</Flex>
      {result.items.length ? <><Pagination current={result.page} total={totalPages} onChange={(page) => apply({ page })} /><Box component="section" className="comic-grid">{result.items.map((video) => <VideoCard key={video.id} video={video} />)}</Box><Pagination current={result.page} total={totalPages} onChange={(page) => apply({ page })} /></> : <Box py={48} px={24} style={{ borderRadius: 14, background: "white", textAlign: "center" }}><Text component="h2" size="xl" fw={700}>还没有可播放视频</Text><Text size="sm" c="ink.5" maw={460} mx="auto" mt={8} mb={20}>先在后台配置视频路径，再执行手动扫描。</Text><AppLink href="/admin/paths" variant="filled" target="_blank" rel="noreferrer">配置视频路径</AppLink></Box>}
    </Container>
  </>;
}

function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (page: number) => void }) {
  if (total <= 1) return null;
  return <Group justify="center" my={20}><AppButton variant="outline" disabled={current <= 1} onClick={() => onChange(current - 1)}>上一页</AppButton><Text size="sm" c="ink.5">{current} / {total}</Text><AppButton variant="outline" disabled={current >= total} onClick={() => onChange(current + 1)}>下一页</AppButton></Group>;
}
