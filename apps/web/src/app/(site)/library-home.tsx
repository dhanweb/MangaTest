"use client";

import { Box, Container, Flex, Group, Text } from "@mantine/core";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ComicCard } from "@/components/comic-card";
import { SiteHeader } from "@/components/site-header";
import { AppButton, AppLink, AppSelect } from "@/components/ui/app-components";
import type { LibraryComicCardRecord, LibraryComicSearchResult, LibraryComicSortMode } from "@/modules/library";
import { useRouter } from "next/navigation";

const sortOptions: Array<{ label: string; value: LibraryComicSortMode }> = [
  { label: "最近添加", value: "recent" },
  { label: "标题", value: "title" },
  { label: "页数", value: "pages" },
];

const fallbackFilterGroups = [
  {
    label: "格式",
    values: [
      { value: "format:directory", label: "目录" },
      { value: "format:zip", label: "ZIP" },
      { value: "format:cbz", label: "CBZ" },
    ],
  },
  {
    label: "状态",
    values: [{ value: "status:readable", label: "本地可读" }],
  },
];

export function LibraryHome({
  initialQuery,
  initialSort,
  result,
}: {
  initialQuery: string;
  initialSort: LibraryComicSortMode;
  result: LibraryComicSearchResult;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [sortMode, setSortMode] = useState<LibraryComicSortMode>(initialSort);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const comics = result.items;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const filterGroups = useMemo(() => {
    const availableFormats = Array.from(
      new Set(comics.map((comic) => comic.localFileKind).filter((kind): kind is "directory" | "zip" | "cbz" => kind !== null)),
    );

    if (availableFormats.length === 0) {
      return fallbackFilterGroups;
    }

    return [
      {
        label: "格式",
        values: availableFormats.map((kind) => ({ value: `format:${kind}`, label: formatKind(kind) })),
      },
      {
        label: "状态",
        values: [{ value: "status:readable", label: "本地可读" }],
      },
    ];
  }, [comics]);

  const filteredComics = useMemo(() => {
    const next = comics.filter((comic) => {
      return selectedTags.every((tag) => matchesFilterTag(comic, tag));
    });

    return next;
  }, [comics, selectedTags]);

  function applySearch(next: { page?: number; query?: string; sort?: LibraryComicSortMode }) {
    const params = new URLSearchParams();
    const nextQuery = next.query ?? query;
    const nextSort = next.sort ?? sortMode;
    const nextPage = next.page ?? result.page;

    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }

    if (nextSort !== "recent") {
      params.set("sort", nextSort);
    }

    if (nextPage > 1) {
      params.set("page", String(nextPage));
    }

    router.push(params.size ? `/?${params.toString()}` : "/");
  }

  return (
    <>
      <SiteHeader active="library" />
      <Container size={1200} px={16} py={32} pb={56}>
        <Box mb={24}>
          <Text component="h1" size="28px" fw={700} lh="1.15" c="pink.5" mb={6} mt={0}>
            漫画库
          </Text>
          <Text size="sm" c="ink.5">
            浏览本地漫画收藏，使用标签筛选你想看的内容。
          </Text>
        </Box>

        <Box
          component="form"
          mb={24}
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 180px", gap: 12 }}
          className="search-row"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch({ page: 1, query });
          }}
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
              onChange={(event) => setQuery(event.currentTarget.value)}
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
            onChange={(value) => {
              const nextSort = (value ?? "recent") as LibraryComicSortMode;
              setSortMode(nextSort);
              applySearch({ page: 1, sort: nextSort });
            }}
            data={sortOptions}
            aria-label="排序方式"
          />
        </Box>

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
          {filterGroups.map((group) => (
            <Box
              key={group.label}
              style={{ display: "grid", gridTemplateColumns: "98px minmax(0, 1fr)", gap: 10, alignItems: "center", padding: "8px 0" }}
              className="tag-filter-row"
            >
              <Text component="strong" size="13px" ta="right" c="#8d5a6e" fw={700}>
                {group.label}:
              </Text>
              <Group gap={8} wrap="wrap">
                {group.values.map((item) => {
                  const isSelected = selectedTags.includes(item.value);
                  return (
                    <AppButton
                      key={item.value}
                      variant={isSelected ? "filled" : "outline"}
                      size="xs"
                      onClick={() =>
                        setSelectedTags(
                          isSelected ? selectedTags.filter((tag) => tag !== item.value) : [...selectedTags, item.value],
                        )
                      }
                    >
                      {item.label}
                    </AppButton>
                  );
                })}
              </Group>
            </Box>
          ))}
        </Box>

        <Flex justify="space-between" mb={24} className="result-summary">
          <Text size="sm" c="ink.5">
            共 {result.total} 本
            {filteredComics.length !== comics.length ? `，当前页筛选后 ${filteredComics.length} 本` : ""}
          </Text>
          {selectedTags.length > 0 && (
            <AppButton variant="transparent" size="xs" onClick={() => setSelectedTags([])} leftSection={<X size={14} />}>
              清除筛选
            </AppButton>
          )}
        </Flex>

        {filteredComics.length > 0 ? (
          <>
            <PaginationBar currentPage={result.page} totalPages={totalPages} onPageChange={(page) => applySearch({ page })} />
            <Box component="section" aria-label="漫画列表" className="comic-grid">
              {filteredComics.map((comic, index) => (
                <ComicCard comic={comic} index={index} key={comic.id} />
              ))}
            </Box>
            <PaginationBar currentPage={result.page} totalPages={totalPages} onPageChange={(page) => applySearch({ page })} />
          </>
        ) : (
          <Box
            component="section"
            py={48}
            px={24}
            style={{ borderRadius: 14, background: "white", textAlign: "center", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}
          >
            <Text component="h2" size="xl" fw={700}>
              还没有可阅读漫画
            </Text>
            <Text size="sm" c="ink.5" maw={460} mx="auto" mt={8} mb={20}>
              先在后台配置 manga root，再执行一次手动扫描。
            </Text>
            <AppLink href="/admin/paths" variant="filled">
              配置漫画路径
            </AppLink>
          </Box>
        )}
      </Container>
    </>
  );
}

function PaginationBar({
  currentPage,
  onPageChange,
  totalPages,
}: {
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <Group justify="center" my={20}>
      <AppButton variant="outline" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
        上一页
      </AppButton>
      <Text size="sm" c="ink.5">
        {currentPage} / {totalPages}
      </Text>
      <AppButton variant="outline" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
        下一页
      </AppButton>
    </Group>
  );
}

function matchesFilterTag(comic: LibraryComicCardRecord, tag: string) {
  if (tag.startsWith("format:")) {
    return comic.localFileKind === tag.slice("format:".length);
  }

  if (tag === "status:readable") {
    return comic.status === "readable";
  }

  return true;
}

function formatKind(kind: "directory" | "zip" | "cbz") {
  if (kind === "directory") {
    return "目录";
  }

  return kind.toUpperCase();
}
