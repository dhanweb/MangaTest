"use client";

/* eslint-disable @next/next/no-img-element -- Reader pages are local files served by pageId and keep native lazy loading. */

import { Box } from "@mantine/core";
import { ArrowLeft, Eye, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from "react";

import { AppButton } from "@/components/ui/app-components";
import type { QueueContextRecord } from "@/modules/collections";
import type { ReaderComicRecord } from "@/modules/library";
import { getReaderKeyboardCommand } from "@/modules/reader/keyboard-shortcuts";

const THUMB_ROW_HEIGHT = 140;
const THUMB_OVERSCAN = 8;

export interface ReaderPreferences {
  readerImmersiveDefault: boolean;
  readerPreloadAheadPages: number;
  readerPreloadEnabled: boolean;
  readerThumbnailSidebarDefault: boolean;
}

export function ReaderView({
  comic,
  preferences,
  queueContext = null,
}: {
  comic: ReaderComicRecord;
  preferences: ReaderPreferences;
  queueContext?: QueueContextRecord | null;
}) {
  const router = useRouter();
  const pages = useMemo(() => comic.pages.map((page, index) => ({ ...page, displayNumber: index + 1 })), [comic.pages]);
  const initialActivePage = useMemo(() => {
    const lastReadIndex = pages.findIndex((page) => page.id === comic.lastReadPageId);
    return lastReadIndex >= 0 ? lastReadIndex + 1 : 1;
  }, [comic.lastReadPageId, pages]);

  const [toolbarVisible, setToolbarVisible] = useState(!preferences.readerImmersiveDefault);
  const [thumbnailSidebarVisible, setThumbnailSidebarVisible] = useState(preferences.readerThumbnailSidebarDefault);
  const [activePage, setActivePage] = useState(initialActivePage);
  const [thumbVisibleRange, setThumbVisibleRange] = useState({ start: 0, end: 24 });

  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);
  const activePageRef = useRef(activePage);
  const programmaticScrollRef = useRef(false);
  const releaseProgrammaticScrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentAnimationRef = useRef<number | null>(null);
  const thumbAnimationRef = useRef<number | null>(null);
  const restoredInitialPageRef = useRef(false);

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

  const updateThumbVisibleRange = useCallback(() => {
    const rail = thumbRailRef.current;
    if (!rail) {
      return;
    }

    const start = Math.max(0, Math.floor(rail.scrollTop / THUMB_ROW_HEIGHT) - THUMB_OVERSCAN);
    const end = Math.min(
      Math.max(pages.length - 1, 0),
      Math.ceil((rail.scrollTop + rail.clientHeight) / THUMB_ROW_HEIGHT) + THUMB_OVERSCAN,
    );

    setThumbVisibleRange((current) => {
      if (current.start === start && current.end === end) {
        return current;
      }

      return { start, end };
    });
  }, [pages.length]);

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

    const pageElements = container.querySelectorAll<HTMLElement>(".reader-page");
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

  const scrollContentTo = useCallback(
    (targetTop: number) => {
      const container = pagesContainerRef.current;
      if (!container) {
        return;
      }

      programmaticScrollRef.current = true;
      if (releaseProgrammaticScrollRef.current) {
        clearTimeout(releaseProgrammaticScrollRef.current);
      }

      animateScrollTop(container, targetTop, 240, contentAnimationRef, () => {
        setCurrentPage(findCurrentPage());
        releaseProgrammaticScrollRef.current = setTimeout(() => {
          programmaticScrollRef.current = false;
        }, 80);
      });
    },
    [animateScrollTop, findCurrentPage, setCurrentPage],
  );

  const scrollContentBy = useCallback(
    (direction: -1 | 1) => {
      const container = pagesContainerRef.current;
      if (!container) {
        return;
      }

      const distance = Math.max(240, container.clientHeight * 0.82);
      scrollContentTo(container.scrollTop + distance * direction);
    },
    [scrollContentTo],
  );

  const executeKeyboardCommand = useCallback(
    (command: ReturnType<typeof getReaderKeyboardCommand>) => {
      if (!command) {
        return;
      }

      const container = pagesContainerRef.current;

      if (command === "scroll_up") {
        scrollContentBy(-1);
        return;
      }

      if (command === "scroll_down") {
        scrollContentBy(1);
        return;
      }

      if (command === "go_to_start") {
        scrollContentTo(0);
        return;
      }

      if (command === "go_to_end") {
        scrollContentTo(container?.scrollHeight ?? 0);
        return;
      }

      if (command === "toggle_toolbar") {
        setToolbarVisible((value) => !value);
        return;
      }

      if (command === "back_to_detail") {
        router.push(`/comics/${comic.id}`);
      }
    },
    [comic.id, router, scrollContentBy, scrollContentTo],
  );

  const handleThumbKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, pageNum: number) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      scrollToPage(pageNum);
    },
    [scrollToPage],
  );

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const command = getReaderKeyboardCommand(event);
      if (!command) {
        return;
      }

      event.preventDefault();
      executeKeyboardCommand(command);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [executeKeyboardCommand]);

  const saveProgress = useCallback(
    (pageNum: number, transport: "fetch" | "beacon" = "fetch") => {
      const page = pages[pageNum - 1];
      if (!page) {
        return;
      }

      const payload = JSON.stringify({
        pageId: page.id,
        progressPercent: Math.round((pageNum / Math.max(pages.length, 1)) * 100),
      });

      if (transport === "beacon" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/reader/progress", new Blob([payload], { type: "application/json" }));
        return;
      }

      void fetch("/api/reader/progress", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: transport === "beacon",
      });
    },
    [pages],
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

  useEffect(() => {
    if (restoredInitialPageRef.current || initialActivePage <= 1) {
      restoredInitialPageRef.current = true;
      return;
    }

    const frame = requestAnimationFrame(() => {
      restoredInitialPageRef.current = true;
      scrollToPage(initialActivePage);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [initialActivePage, scrollToPage]);

  useEffect(() => {
    const rail = thumbRailRef.current;
    if (!rail) {
      return;
    }

    rail.addEventListener("scroll", updateThumbVisibleRange, { passive: true });
    updateThumbVisibleRange();

    return () => {
      rail.removeEventListener("scroll", updateThumbVisibleRange);
    };
  }, [updateThumbVisibleRange]);

  useEffect(() => {
    const timeoutId = setTimeout(() => saveProgress(activePage), 900);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [activePage, saveProgress]);

  useEffect(() => {
    if (!preferences.readerPreloadEnabled || preferences.readerPreloadAheadPages <= 0) {
      return;
    }

    const preloadCount = Math.min(12, Math.max(0, preferences.readerPreloadAheadPages));
    for (let index = 1; index <= preloadCount; index += 1) {
      const page = pages[activePage - 1 + index];
      if (!page) {
        continue;
      }

      const image = new Image();
      image.decoding = "async";
      image.src = getPageImageUrl(page.id);
    }
  }, [activePage, pages, preferences.readerPreloadAheadPages, preferences.readerPreloadEnabled]);

  useEffect(() => {
    function onPageHide() {
      saveProgress(activePageRef.current, "beacon");
    }

    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [saveProgress]);

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
          {toolbarVisible ? "隐藏" : "显示"}
        </AppButton>
        <AppButton
          variant="transparent"
          size="xs"
          leftSection={<Settings size={18} />}
          onClick={() => setThumbnailSidebarVisible((value) => !value)}
          styles={{
            root: {
              color: "white",
              background: "rgba(255,255,255,0.08)",
              "&:hover": { background: "rgba(255,255,255,0.18)" },
            },
          }}
        >
          缩略图
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
          className={`reader-thumb-rail${toolbarVisible && thumbnailSidebarVisible ? "" : " is-hidden"}`}
          aria-label="页面缩略图"
        >
          {pages.map((page, index) => {
            const shouldLoadThumb =
              (index >= thumbVisibleRange.start && index <= thumbVisibleRange.end) ||
              Math.abs(page.displayNumber - activePage) <= THUMB_OVERSCAN;

            return (
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
                  {shouldLoadThumb ? (
                    <img
                      alt=""
                    className="reader-thumb-image"
                    decoding="async"
                    loading="lazy"
                    src={getPageThumbnailUrl(page.id)}
                    />
                  ) : (
                    <div className="reader-thumb-placeholder">PAGE {String(page.displayNumber).padStart(2, "0")}</div>
                  )}
                </div>
              </Box>
            );
          })}
        </Box>

        <Box component="section" ref={pagesContainerRef} className="reader-pages" aria-label="漫画页面">
          <Box className="reader-divider">
            <span>{comic.chapters[0]?.title ?? "单章节"}</span>
            <strong>{comic.displayTitle}</strong>
          </Box>
          {pages.length > 0 ? (
            pages.map((page, index) => {
              const previousPage = index > 0 ? pages[index - 1] : null;
              const chapterChanged = !previousPage || previousPage.chapterId !== page.chapterId;
              const chapterTitle = page.chapterTitle ?? "未命名章节";

              return (
                <div key={page.id}>
                  {index > 0 && chapterChanged ? (
                    <Box className="reader-divider reader-chapter-divider">
                      <span>{chapterTitle}</span>
                    </Box>
                  ) : null}
                  <Box
                    component="article"
                    className="reader-page"
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
                    <img
                      alt={`${comic.displayTitle} 第 ${page.displayNumber} 页`}
                      className="reader-page-image"
                      decoding="async"
                      loading={page.displayNumber <= 2 ? "eager" : "lazy"}
                      src={getPageImageUrl(page.id)}
                    />
                  </Box>
                </div>
              );
            })
          ) : (
            <Box className="reader-page">
              <span>暂无页面</span>
              <p>{comic.displayTitle}</p>
            </Box>
          )}
          {queueContext && queueContext.nextComicId ? (
            <Box className="reader-divider reader-next-comic">
              <span>当前队列 {queueContext.position} / {queueContext.total}</span>
              <strong>下一本：{queueContext.nextComicTitle}</strong>
              <AppButton
                component={Link}
                href={`/reader/${encodeURIComponent(queueContext.nextComicId)}`}
                variant="filled"
                size="sm"
                mt={6}
              >
                继续阅读下一本
              </AppButton>
            </Box>
          ) : queueContext ? (
            <Box className="reader-divider reader-next-comic">
              <span>队列最后一本</span>
              <strong>{queueContext.queue.name} 已读完</strong>
            </Box>
          ) : (
            <Box className="reader-divider">
              <span>当前漫画已读完</span>
              <strong>返回详情页继续探索</strong>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function getPageImageUrl(pageId: string) {
  return `/api/pages/${encodeURIComponent(pageId)}`;
}

function getPageThumbnailUrl(pageId: string) {
  return `/api/pages/${encodeURIComponent(pageId)}/thumbnail?w=176&h=264`;
}
