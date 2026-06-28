"use client";

import { useMemo, useState } from "react";
import { Box, Container, Flex, Group, Text } from "@mantine/core";
import { Search, X } from "lucide-react";
import { ComicCard } from "@/components/ComicCard";
import { SiteHeader } from "@/components/SiteHeader";
import { AppButton, AppSelect } from "@/components/ui/app-components";
import { comics, sortOptions, tagGroups, type SortMode } from "@/lib/mock-data";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const filteredComics = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = comics.filter((comic) => {
      const text = [comic.title, comic.originalTitle, comic.artist, comic.fileTitle, comic.tags.join(" ")].join(" ").toLowerCase();
      return (!q || text.includes(q))
        && selectedTags.every((tag) => comic.tags.some((t) => t.includes(tag)));
    });
    return next.toSorted((a, b) => {
      if (sortMode === "title") return a.title.localeCompare(b.title, "zh-Hans-CN");
      if (sortMode === "progress") return b.progress - a.progress;
      return b.addedAt.localeCompare(a.addedAt);
    });
  }, [query, selectedTags, sortMode]);

  return (
    <>
      <SiteHeader active="library" />
      <Container size={1200} px={16} py={32} pb={56}>
        <Box mb={24}>
          <Text component="h1" size="28px" fw={700} lh="1.15" c="pink.5" mb={6} mt={0}>
            漫画库
          </Text>
          <Text size="sm" c="ink.5">浏览本地漫画收藏，使用标签筛选你想看的内容。</Text>
        </Box>

        {/* Search row */}
        <Box
          mb={24}
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 180px", gap: 12 }}
        >
          <Box
            component="label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 42,
              padding: "0 13px",
              border: "1px solid var(--mantine-color-pink-2)",
              borderRadius: 10,
              background: "white",
            }}
          >
            <Search size={18} style={{ color: "var(--mantine-color-ink-5)", flexShrink: 0 }} />
            <Box
              component="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="搜索漫画名称、作者或标签..."
              style={{
                width: "100%",
                minWidth: 0,
                border: 0,
                outline: 0,
                background: "transparent",
                color: "var(--mantine-color-ink-7)",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
          </Box>

          <AppSelect
            value={sortMode}
            onChange={(value) => setSortMode((value ?? "recent") as SortMode)}
            data={sortOptions.map((o) => ({ value: o.value, label: o.label }))}
            aria-label="排序方式"
          />
        </Box>

        {/* Tag filter */}
        <Box
          component="section"
          p="lg"
          mb={24}
          style={{
            border: "1px solid var(--mantine-color-pink-2)",
            borderRadius: 14,
            background: "white",
            boxShadow: "0 8px 24px rgba(239,59,145,0.08)",
          }}
          aria-label="标签快捷搜索"
        >
          {tagGroups.map((group) => (
            <Box
              key={group.label}
              style={{ display: "grid", gridTemplateColumns: "98px minmax(0, 1fr)", gap: 10, alignItems: "flex-start", padding: "8px 0" }}
            >
              <Text component="strong" size="13px" ta="right" c="#b77792" fw={700}>
                {group.label}:
              </Text>
              <Group gap={8} wrap="wrap">
                {group.values.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <AppButton
                      key={tag}
                      variant={isSelected ? "filled" : "outline"}
                      size="xs"
                      onClick={() => setSelectedTags(isSelected ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag])}
                    >
                      {tag}
                    </AppButton>
                  );
                })}
              </Group>
            </Box>
          ))}
        </Box>

        {/* Result summary */}
        <Flex justify="space-between" mb={24}>
          <Text size="sm" c="ink.5">共 {filteredComics.length} 本</Text>
          {selectedTags.length > 0 && (
            <AppButton variant="transparent" size="xs" onClick={() => setSelectedTags([])} leftSection={<X size={14} />}>
              清除筛选
            </AppButton>
          )}
        </Flex>

        {/* Comic grid */}
        <Box
          component="section"
          aria-label="漫画列表"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 18,
          }}
          className="mantine-comic-grid"
        >
          {filteredComics.map((comic) => (
            <ComicCard comic={comic} key={comic.id} />
          ))}
        </Box>
      </Container>
    </>
  );
}
