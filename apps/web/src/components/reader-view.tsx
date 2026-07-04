"use client";

import { Box } from "@mantine/core";
import { ArrowLeft, Eye, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";

import { AppButton } from "@/components/ui/app-components";
import type { ReaderComicRecord } from "@/modules/library";

const MAX_PAGES = 150;

export function ReaderView({ comic }: { comic: ReaderComicRecord }) {
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [activePage, setActivePage] = useState(1);

  const pages = useMemo(
    () => comic.pages.slice(0, MAX_PAGES).map((page, index) => ({ ...page, displayNumber: index + 1 })),
    [comic.pages],
  );

  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);
  const activePageRef = useRef(activePage);
  const programmaticScrollRef = useRef(false);
  const releaseProgrammaticScrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentAnimationRef = useRef<number | null>(null);
  const thumbAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  const cancelScrollFrame = useCallback((frameRef: MutableRefObject<number | null>) => {
    if (frameRef.current === null) {
      return;
    }

    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const animateScrollTop = useCallback(
    (
      element: HTMLElement,
      targetTop: number,
      duration: number,
      frameRef: MutableRefObject<number | null>,
      onDone?: () => void,
    ) => {
      cancelScrollFrame(frameRef);

      const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
      const target = Math.max(0, Math.min(targetTop, maxTop));
      const start = element.scrollTop;
      const change = target - start;

      if (duration <= 0 || Math.abs(change) < 1) {
        element.scrollTop = target;
        onDone?.();
        return;
      }

      const startTime = performance.now();
      const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);

      const step = (now: number) => {
        const progress = Math.min(1, (now - startTime) / duration);
        element.scrollTop = start + change * easeOut(progress);

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(step);
          return;
        }

        frameRef.current = null;
        onDone?.();
      };

      frameRef.current = requestAnimationFrame(step);
    },
    [cancelScrollFrame],
  );

  const centerThumbnail = useCallback(
    (pageNum: number, animation = true) => {
      const rail = thumbRailRef.current;
      const thumb = rail?.querySelector<HTMLElement>(`[data-page="${pageNum}"]`);
      if (!rail || !thumb) {
        return;
      }

      const railRect = rail.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();
      const thumbCenter = thumbRect.top - railRect.top + thumbRect.height / 2;
      const targetTop = rail.scrollTop + thumbCenter - rail.clientHeight / 2;
      animateScrollTop(rail, targetTop, animation ? 260 : 0, thumbAnimationRef);
    },
    [animateScrollTop],
  );

  const setCurrentPage = useCallback(
    (pageNum: number) => {
      if (activePageRef.current === pageNum) {
        return;
      }

      activePageRef.current = pageNum;
      setActivePage(pageNum);
      centerThumbnail(pageNum);
    },
    [centerThumbnail],
  );

  const findCurrentPage = useCallback(() => {
    const container = pagesContainerRef.current;
    if (!container) {
      return activePageRef.current;
    }

    const pageElements = container.querySelectorAll<HTMLElement>(".mock-page");
    const availableScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const centerOffset = Math.min(availableScroll, container.clientHeight) / 2;
    const scrollTop = container.scrollTop;
    let focusLine = scrollTop + container.clientHeight / 2;

    if (centerOffset > 0) {
      if (scrollTop < centerOffset) {
        focusLine = scrollTop + centerOffset * (scrollTop / centerOffset);
      } else if (scrollTop + centerOffset > availableScroll) {
        focusLine = scrollTop + centerOffset + centerOffset * (1 - (availableScroll - scrollTop) / centerOffset);
      } else {
        focusLine = scrollTop + centerOffset;
      }
    }

    let closest = activePageRef.current;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const pageElement of pageElements) {
      const pageNum = Number(pageElement.dataset.page);
      const top = pageElement.offsetTop;
      const bottom = top + pageElement.offsetHeight;

      if (top <= focusLine && bottom >= focusLine) {
        return pageNum;
      }

      const distance = Math.abs(top + pageElement.offsetHeight / 2 - focusLine);
      if (distance < closestDistance) {
        closest = pageNum;
        closestDistance = distance;
      }
    }

    return closest;
  }, []);

  const scrollToPage = useCallback(
    (pageNum: number) => {
      const container = pagesContainerRef.current;
      const pageElement = pageRefs.current.get(pageNum);
      if (!container || !pageElement) {
        return;
      }

      programmaticScrollRef.current = true;
      if (releaseProgrammaticScrollRef.current) {
        clearTimeout(releaseProgrammaticScrollRef.current);
      }

      setCurrentPage(pageNum);
      centerThumbnail(pageNum);

      const targetTop = pageElement.offsetTop - (container.clientHeight - pageElement.offsetHeight) / 2;
      animateScrollTop(container, targetTop, 360, contentAnimationRef, () => {
        releaseProgrammaticScrollRef.current = setTimeout(() => {
          programmaticScrollRef.current = false;
        }, 80);
      });
    },
    [animateScrollTop, centerThumbnail, setCurrentPage],
  );

  const handleThumbKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, pageNum: number) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      scrollToPage(pageNum);
    },
    [scrollToPage],
  );

  useEffect(() => {
    const container = pagesContainerRef.current;
    if (!container) {
      return;
    }

    function onScroll() {
      if (programmaticScrollRef.current) {
        return;
      }

      setCurrentPage(findCurrentPage());
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      container.removeEventListener("scroll", onScroll);
      if (releaseProgrammaticScrollRef.current) {
        clearTimeout(releaseProgrammaticScrollRef.current);
      }
      cancelScrollFrame(contentAnimationRef);
      cancelScrollFrame(thumbAnimationRef);
    };
  }, [cancelScrollFrame, findCurrentPage, setCurrentPage]);

  return (
    <Box component="main" className="reader-shell">
      <Box component="header" className={`reader-toolbar${toolbarVisible ? "" : " is-hidden"}`}>
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
          <strong>{comic.displayTitle}</strong>
          <span>
            垂直阅读 · {activePage}/{Math.max(pages.length, 1)}
          </span>
        </Box>
        <AppButton
          variant="transparent"
          size="xs"
          onClick={() => setToolbarVisible((value) => !value)}
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
          disabled
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
        onClick={() => setToolbarVisible((value) => !value)}
        aria-label="显示或隐藏工具栏"
      />

      <Box className="reader-body">
        <Box
          component="nav"
          ref={thumbRailRef}
          className={`reader-thumb-rail${toolbarVisible ? "" : " is-hidden"}`}
          aria-label="页面缩略图"
        >
          {pages.map((page) => (
            <Box
              component="div"
              key={page.id}
              role="button"
              tabIndex={0}
              data-page={page.displayNumber}
              className={`reader-thumb-btn${page.displayNumber === activePage ? " is-active" : ""}`}
              aria-current={page.displayNumber === activePage ? "page" : undefined}
              aria-label={`跳转到第 ${page.displayNumber} 页`}
              onClick={() => scrollToPage(page.displayNumber)}
              onKeyDown={(event) => handleThumbKeyDown(event, page.displayNumber)}
            >
              <div className="reader-thumb-index">{page.displayNumber}</div>
              <div className="reader-thumb-sheet" aria-hidden="true">
                <div className="reader-thumb-sheet-label">PAGE {String(page.displayNumber).padStart(2, "0")}</div>
              </div>
            </Box>
          ))}
        </Box>

        <Box component="section" ref={pagesContainerRef} className="reader-pages" aria-label="漫画页面">
          <Box className="reader-divider">
            <span>{comic.chapters[0]?.title ?? "单章节"}</span>
            <strong>{comic.displayTitle}</strong>
          </Box>
          {pages.length > 0 ? (
            pages.map((page) => (
              <Box
                component="article"
                className="mock-page"
                key={page.id}
                data-page={page.displayNumber}
                ref={(node) => {
                  if (node) {
                    pageRefs.current.set(page.displayNumber, node);
                  } else {
                    pageRefs.current.delete(page.displayNumber);
                  }
                }}
              >
                <span>PAGE {String(page.displayNumber).padStart(2, "0")}</span>
                <p>{page.internalPath}</p>
              </Box>
            ))
          ) : (
            <Box className="mock-page">
              <span>暂无页面</span>
              <p>{comic.displayTitle}</p>
            </Box>
          )}
          <Box className="reader-divider">
            <span>当前章节已接近底部</span>
            <strong>下一话将自动接在下面</strong>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
