"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ActionIcon, Box } from "@mantine/core";
import { ArrowLeft, Eye, Settings } from "lucide-react";
import { AppButton } from "@/components/ui/app-components";
import { getComic } from "@/lib/mock-data";

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const comic = getComic(params.id);
  const [toolbarVisible, setToolbarVisible] = useState(true);

  const pages = useMemo(
    () => (comic ? Array.from({ length: Math.min(comic.pages, 18) }, (_, i) => i + 1) : []),
    [comic],
  );

  if (!comic) {
    return (
      <Box component="main" className="reader-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box component="p" style={{ color: "rgba(255,255,255,0.6)" }}>找不到该漫画。</Box>
      </Box>
    );
  }

  return (
    <Box component="main" className="reader-shell">
      <Box
        component="header"
        className={`reader-toolbar${toolbarVisible ? "" : " is-hidden"}`}
      >
        <Box
          component={Link}
          href={`/comics/${comic.id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 34,
            padding: "0 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.08)",
            color: "white",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          <ArrowLeft size={18} /> 返回详情
        </Box>
        <Box style={{ display: "grid", minWidth: 0 }}>
          <strong>{comic.title}</strong>
          <span>垂直阅读 · {comic.progress}%</span>
        </Box>
        <AppButton
          variant="transparent"
          size="xs"
          onClick={() => setToolbarVisible((v) => !v)}
          leftSection={<Eye size={18} />}
          styles={{
            root: {
              color: "white",
              background: "rgba(255,255,255,0.08)",
              "&:hover": { background: "rgba(255,255,255,0.18)" },
            },
          }}
        >
          隐藏
        </AppButton>
        <AppButton
          variant="transparent"
          size="xs"
          leftSection={<Settings size={18} />}
          styles={{
            root: {
              color: "white",
              background: "rgba(255,255,255,0.08)",
              "&:hover": { background: "rgba(255,255,255,0.18)" },
            },
          }}
        >
          设置
        </AppButton>
      </Box>

      <Box
        component="button"
        className="reader-edge-toggle"
        type="button"
        onClick={() => setToolbarVisible((v) => !v)}
        aria-label="显示或隐藏工具栏"
      />

      <Box component="section" className="reader-pages" aria-label="漫画页面">
        <Box className="reader-divider">
          <span>{comic.chapters[0]?.title}</span>
          <strong>{comic.title}</strong>
        </Box>
        {pages.map((page) => (
          <Box component="article" className="mock-page" key={page}>
            <span>PAGE {String(page).padStart(2, "0")}</span>
            <p>{comic.title}</p>
          </Box>
        ))}
        <Box className="reader-divider">
          <span>当前章节已接近底部</span>
          <strong>下一话将自动接在下面</strong>
        </Box>
      </Box>

      <Box component="aside" className="thumb-rail" aria-label="缩略图导航">
        {pages.slice(0, 10).map((page) => (
          <ActionIcon
            key={page}
            variant={page === 7 ? "filled" : "default"}
            color="pink"
            size={34}
            styles={{
              root: {
                background: page === 7 ? undefined : "rgba(255,255,255,0.12)",
                color: "white",
              },
            }}
          >
            {page}
          </ActionIcon>
        ))}
      </Box>
    </Box>
  );
}
