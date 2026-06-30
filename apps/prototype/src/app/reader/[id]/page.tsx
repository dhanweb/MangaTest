"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Box } from "@mantine/core";
import { ArrowLeft, Eye, Settings } from "lucide-react";
import { AppButton } from "@/components/ui/app-components";
import { getComic } from "@/lib/mock-data";

const MAX_PAGES = 150;

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const comic = getComic(params.id);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [activePage, setActivePage] = useState(1);

  const pages = useMemo(
    () => (comic ? Array.from({ length: Math.min(comic.pages, MAX_PAGES) }, (_, i) => i + 1) : []),
    [comic],
  );

  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);

  // --- Content scroll → update active thumbnail ---
  useEffect(() => {
    const container = pagesContainerRef.current;
    if (!container) return;

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const children = container!.querySelectorAll(".mock-page");
        if (children.length === 0) { ticking = false; return; }

        let closest = 1;
        let minDist = Infinity;
        const viewCenter = window.innerHeight / 2;

        children.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const elCenter = rect.top + rect.height / 2;
          const dist = Math.abs(elCenter - viewCenter);
          if (dist < minDist) {
            minDist = dist;
            closest = Number((el as HTMLElement).dataset.page);
          }
        });

        setActivePage(closest);

        // auto-scroll thumb rail
        const thumb = thumbRailRef.current?.querySelector(`[data-page="${closest}"]`);
        thumb?.scrollIntoView({ block: "nearest", behavior: "smooth" });

        ticking = false;
      });
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // --- Click thumbnail → scroll to page ---
  const scrollToPage = useCallback((pageNum: number) => {
    const el = pageRefs.current.get(pageNum);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (!comic) {
    return (
      <Box component="main" className="reader-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box component="p" style={{ color: "rgba(255,255,255,0.6)" }}>找不到该漫画。</Box>
      </Box>
    );
  }

  return (
    <Box component="main" className="reader-shell">
      {/* Top toolbar */}
      <Box
        component="header"
        className={`reader-toolbar${toolbarVisible ? "" : " is-hidden"}`}
      >
        <Box
          component={Link}
          href={`/comics/${comic.id}`}
          className="reader-back-link"
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
            transition: "background 0.16s ease",
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

      {/* Edge toggle */}
      <Box
        component="button"
        className="reader-edge-toggle"
        type="button"
        onClick={() => setToolbarVisible((v) => !v)}
        aria-label="显示或隐藏工具栏"
      />

      {/* Body: thumb rail + content */}
      <Box className="reader-body">
        {/* Left thumbnail rail */}
        <Box
          component="nav"
          ref={thumbRailRef}
          className={`reader-thumb-rail${toolbarVisible ? "" : " is-hidden"}`}
          aria-label="页面缩略图"
        >
          {pages.map((p) => (
            <Box
              component="button"
              key={p}
              type="button"
              data-page={p}
              className={`reader-thumb-btn${p === activePage ? " is-active" : ""}`}
              onClick={() => scrollToPage(p)}
            >
              {p}
            </Box>
          ))}
        </Box>

        {/* Main content */}
        <Box
          component="section"
          ref={pagesContainerRef}
          className="reader-pages"
          aria-label="漫画页面"
        >
          <Box className="reader-divider">
            <span>{comic.chapters[0]?.title}</span>
            <strong>{comic.title}</strong>
          </Box>
          {pages.map((page) => (
            <Box
              component="article"
              className="mock-page"
              key={page}
              data-page={page}
              ref={(node) => {
                if (node) pageRefs.current.set(page, node);
                else pageRefs.current.delete(page);
              }}
            >
              <span>PAGE {String(page).padStart(2, "0")}</span>
              <p>{comic.title}</p>
            </Box>
          ))}
          <Box className="reader-divider">
            <span>当前章节已接近底部</span>
            <strong>下一话将自动接在下面</strong>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
