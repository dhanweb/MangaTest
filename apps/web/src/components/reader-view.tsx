"use client";

/* eslint-disable @next/next/no-img-element -- Reader pages are local files served by pageId and keep native lazy loading. */

import { Box } from "@mantine/core";
import { ArrowLeft, Eye, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";

import { AppButton } from "@/components/ui/app-components";
import type { QueueContextRecord } from "@/modules/collections";
import type { ReaderManifestRecord, ReaderPageRecord, ReaderPageWindowRecord } from "@/modules/library";
import { getReaderKeyboardCommand } from "@/modules/reader/keyboard-shortcuts";
import {
  buildReaderPageLayout,
  findPageIndexAtOffset,
  getPageScrollTop,
  getThumbnailVisibleRange,
  getVisiblePageRange,
  READER_PAGE_OVERSCAN,
  READER_THUMB_OVERSCAN,
  READER_THUMB_ROW_HEIGHT,
  type ReaderPageLayout,
  type ReaderVisibleRange,
} from "@/modules/reader/virtual-layout";

const READER_CONTENT_WIDTH = 760;
const READER_TOP_DIVIDER_HEIGHT = 86;
const READER_PAGE_WINDOW_SIZE = 48;
const READER_PAGE_WINDOW_MAX = 96;

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
  comic: ReaderManifestRecord;
  preferences: ReaderPreferences;
  queueContext?: QueueContextRecord | null;
}) {
  const router = useRouter();
  const initialActivePage = Math.max(1, Math.min(comic.totalPages || 1, (comic.lastReadPageIndex ?? 0) + 1));
  const [pageCache, setPageCache] = useState<Map<number, ReaderPageRecord>>(() =>
    createPageCache(comic.initialPages, comic.initialStartIndex),
  );
  const [toolbarVisible, setToolbarVisible] = useState(!preferences.readerImmersiveDefault);
  const [thumbnailSidebarVisible, setThumbnailSidebarVisible] = useState(preferences.readerThumbnailSidebarDefault);
  const [activePage, setActivePage] = useState(initialActivePage);
  const [pageVisibleRange, setPageVisibleRange] = useState<ReaderVisibleRange>({
    start: Math.max(0, initialActivePage - 1 - READER_PAGE_OVERSCAN),
    end: Math.min(Math.max(comic.totalPages - 1, 0), initialActivePage - 1 + READER_PAGE_OVERSCAN),
  });
  const [thumbVisibleRange, setThumbVisibleRange] = useState<ReaderVisibleRange>({
    start: Math.max(0, initialActivePage - 1 - READER_THUMB_OVERSCAN),
    end: Math.min(Math.max(comic.totalPages - 1, 0), initialActivePage - 1 + READER_THUMB_OVERSCAN),
  });
  const [pageContentWidth, setPageContentWidth] = useState(READER_CONTENT_WIDTH);
  const [pageWindowError, setPageWindowError] = useState<string | null>(null);

  const pageCacheRef = useRef(pageCache);
  const pageLayoutRef = useRef<ReaderPageLayout | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);
  const activePageRef = useRef(activePage);
  const programmaticScrollRef = useRef(false);
  const releaseProgrammaticScrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentAnimationRef = useRef<number | null>(null);
  const thumbAnimationRef = useRef<number | null>(null);
  const restoredInitialPageRef = useRef(false);
  const initialRestorePendingRef = useRef(initialActivePage > 1);
  const pendingPageScrollRef = useRef<number | null>(null);
  const requestedWindowsRef = useRef(new Set<string>());
  const lastPageWindowRef = useRef<{ startIndex: number; limit: number } | null>(null);

  const pageLayout = useMemo(() => {
    const pages = Array.from({ length: comic.totalPages }, (_, index) => pageCache.get(index) ?? null);
    return buildReaderPageLayout(pages, comic.chapters, pageContentWidth);
  }, [comic.chapters, comic.totalPages, pageCache, pageContentWidth]);

  useEffect(() => {
    pageLayoutRef.current = pageLayout;
  }, [pageLayout]);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  const mergePageCache = useCallback((window: ReaderPageWindowRecord) => {
    const next = new Map(pageCacheRef.current);
    window.pages.forEach((page, index) => {
      next.set(window.startIndex + index, page);
    });
    pageCacheRef.current = next;
    setPageCache(next);
  }, []);

  const loadPageWindow = useCallback(
    async (startIndex: number, limit: number) => {
      const key = String(startIndex) + ":" + String(limit);
      if (requestedWindowsRef.current.has(key)) {
        return;
      }

      requestedWindowsRef.current.add(key);
      lastPageWindowRef.current = { startIndex, limit };

      try {
        const response = await fetch(
          "/api/reader/" + encodeURIComponent(comic.id) + "/pages?start=" + String(startIndex) + "&limit=" + String(limit),
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error("页面窗口请求失败（" + String(response.status) + "）");
        }

        const payload = parseReaderPageWindow(await response.json());
        if (!payload || payload.comicId !== comic.id) {
          throw new Error("页面窗口响应格式无效");
        }

        mergePageCache(payload);
        setPageWindowError(null);
      } catch (error) {
        requestedWindowsRef.current.delete(key);
        setPageWindowError(error instanceof Error ? error.message : "页面窗口加载失败");
      }
    },
    [comic.id, mergePageCache],
  );

  const ensurePageWindowForRange = useCallback(
    (rangeStart: number, rangeEnd: number) => {
      if (comic.totalPages <= 0 || rangeEnd < rangeStart) {
        return;
      }

      const start = Math.max(0, Math.min(comic.totalPages - 1, Math.trunc(rangeStart)));
      const end = Math.max(start, Math.min(comic.totalPages - 1, Math.trunc(rangeEnd)));
      let firstMissing = -1;
      for (let index = start; index <= end; index += 1) {
        if (!pageCacheRef.current.has(index)) {
          firstMissing = index;
          break;
        }
      }

      if (firstMissing < 0) {
        return;
      }

      const startIndex = Math.max(0, Math.min(firstMissing, comic.totalPages - READER_PAGE_WINDOW_SIZE));
      const limit = Math.min(READER_PAGE_WINDOW_SIZE, comic.totalPages - startIndex);
      void loadPageWindow(startIndex, Math.min(READER_PAGE_WINDOW_MAX, limit));
    },
    [comic.totalPages, loadPageWindow],
  );

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
      if (!rail || comic.totalPages <= 0) {
        return;
      }

      const index = Math.max(0, Math.min(comic.totalPages - 1, pageNum - 1));
      const targetTop = index * READER_THUMB_ROW_HEIGHT + READER_THUMB_ROW_HEIGHT / 2 - rail.clientHeight / 2;
      animateScrollTop(rail, targetTop, animation ? 260 : 0, thumbAnimationRef);
    },
    [animateScrollTop, comic.totalPages],
  );

  const updateThumbVisibleRange = useCallback(() => {
    const rail = thumbRailRef.current;
    if (!rail || initialRestorePendingRef.current) {
      return;
    }

    const range = getThumbnailVisibleRange(comic.totalPages, rail.scrollTop, rail.clientHeight);
    setThumbVisibleRange((current) => {
      if (current.start === range.start && current.end === range.end) {
        return current;
      }

      return range;
    });
  }, [comic.totalPages]);

  const setCurrentPage = useCallback(
    (pageNum: number) => {
      const nextPage = Math.max(1, Math.min(Math.max(comic.totalPages, 1), Math.trunc(pageNum)));
      if (activePageRef.current === nextPage) {
        return;
      }

      activePageRef.current = nextPage;
      setActivePage(nextPage);
      centerThumbnail(nextPage);
    },
    [centerThumbnail, comic.totalPages],
  );

  const updatePageVisibleRange = useCallback(() => {
    const container = pagesContainerRef.current;
    if (!container || initialRestorePendingRef.current) {
      return;
    }

    const layout = pageLayoutRef.current;
    if (!layout) {
      return;
    }

    const range = getVisiblePageRange(
      layout,
      Math.max(0, container.scrollTop - READER_TOP_DIVIDER_HEIGHT),
      container.clientHeight,
    );
    setPageVisibleRange((current) => {
      if (current.start === range.start && current.end === range.end) {
        return current;
      }

      return range;
    });
  }, []);

  const findCurrentPage = useCallback(() => {
    const container = pagesContainerRef.current;
    const layout = pageLayoutRef.current;
    if (!container || !layout || layout.items.length === 0) {
      return 1;
    }

    const focusOffset = Math.max(
      0,
      Math.min(layout.totalHeight - 1, container.scrollTop - READER_TOP_DIVIDER_HEIGHT + container.clientHeight / 2),
    );
    return findPageIndexAtOffset(layout, focusOffset) + 1;
  }, []);

  const scrollContentTo = useCallback(
    (targetTop: number, duration = 240) => {
      const container = pagesContainerRef.current;
      if (!container) {
        return;
      }

      programmaticScrollRef.current = true;
      if (releaseProgrammaticScrollRef.current) {
        clearTimeout(releaseProgrammaticScrollRef.current);
      }

      animateScrollTop(container, targetTop, duration, contentAnimationRef, () => {
        setCurrentPage(findCurrentPage());
        releaseProgrammaticScrollRef.current = setTimeout(() => {
          programmaticScrollRef.current = false;
        }, 80);
      });
    },
    [animateScrollTop, findCurrentPage, setCurrentPage],
  );

  const scrollToPage = useCallback(
    (pageNum: number, animation = true) => {
      const container = pagesContainerRef.current;
      const layout = pageLayoutRef.current;
      if (!container || !layout || comic.totalPages <= 0) {
        return;
      }

      const pageIndex = Math.max(0, Math.min(comic.totalPages - 1, Math.trunc(pageNum) - 1));
      setCurrentPage(pageIndex + 1);
      centerThumbnail(pageIndex + 1, animation);

      if (!pageCacheRef.current.has(pageIndex)) {
        pendingPageScrollRef.current = pageIndex;
        ensurePageWindowForRange(pageIndex, pageIndex);
      }

      const targetTop = READER_TOP_DIVIDER_HEIGHT + getPageScrollTop(layout, pageIndex, container.clientHeight);
      scrollContentTo(targetTop, animation ? 360 : 0);
    },
    [centerThumbnail, comic.totalPages, ensurePageWindowForRange, scrollContentTo, setCurrentPage],
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
        router.push("/comics/" + comic.id);
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

  const saveProgress = useCallback(
    (pageNum: number, transport: "fetch" | "beacon" = "fetch") => {
      const page = pageCacheRef.current.get(pageNum - 1);
      if (!page) {
        return;
      }

      const payload = JSON.stringify({
        pageId: page.id,
        progressPercent: Math.round((pageNum / Math.max(comic.totalPages, 1)) * 100),
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
    [comic.totalPages],
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

  useEffect(() => {
    const container = pagesContainerRef.current;
    if (!container) {
      return;
    }

    const updateDimensions = () => {
      const nextWidth = Math.min(READER_CONTENT_WIDTH, Math.max(1, container.clientWidth));
      setPageContentWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    function onScroll() {
      updatePageVisibleRange();
      if (!programmaticScrollRef.current && !initialRestorePendingRef.current) {
        setCurrentPage(findCurrentPage());
      }
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    updateDimensions();
    onScroll();

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateDimensions);
    resizeObserver?.observe(container);

    return () => {
      container.removeEventListener("scroll", onScroll);
      resizeObserver?.disconnect();
    };
  }, [findCurrentPage, setCurrentPage, updatePageVisibleRange]);

  useEffect(() => {
    if (restoredInitialPageRef.current || initialActivePage <= 1) {
      restoredInitialPageRef.current = true;
      initialRestorePendingRef.current = false;
      return;
    }

    const frame = requestAnimationFrame(() => {
      restoredInitialPageRef.current = true;
      scrollToPage(initialActivePage, false);
      initialRestorePendingRef.current = false;
      updatePageVisibleRange();
      updateThumbVisibleRange();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [initialActivePage, scrollToPage, updatePageVisibleRange, updateThumbVisibleRange]);

  useEffect(() => {
    const rail = thumbRailRef.current;
    if (!rail) {
      return;
    }

    function onScroll() {
      updateThumbVisibleRange();
    }

    rail.addEventListener("scroll", onScroll, { passive: true });
    updateThumbVisibleRange();

    return () => {
      rail.removeEventListener("scroll", onScroll);
    };
  }, [updateThumbVisibleRange]);

  useEffect(() => {
    if (initialRestorePendingRef.current) {
      return;
    }

    ensurePageWindowForRange(pageVisibleRange.start, pageVisibleRange.end);
  }, [ensurePageWindowForRange, pageVisibleRange]);

  useEffect(() => {
    if (initialRestorePendingRef.current) {
      return;
    }

    ensurePageWindowForRange(thumbVisibleRange.start, thumbVisibleRange.end);
  }, [ensurePageWindowForRange, thumbVisibleRange]);

  useEffect(() => {
    const pendingPageIndex = pendingPageScrollRef.current;
    if (pendingPageIndex === null || !pageCache.has(pendingPageIndex)) {
      return;
    }

    pendingPageScrollRef.current = null;
    const frame = requestAnimationFrame(() => {
      scrollToPage(pendingPageIndex + 1, false);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pageCache, scrollToPage]);

  useEffect(() => {
    const timeoutId = setTimeout(() => saveProgress(activePage), 900);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [activePage, pageCache, saveProgress]);

  useEffect(() => {
    if (!preferences.readerPreloadEnabled || preferences.readerPreloadAheadPages <= 0) {
      return;
    }

    const preloadCount = Math.min(12, Math.max(0, preferences.readerPreloadAheadPages));
    const startIndex = activePage;
    const endIndex = Math.min(comic.totalPages - 1, activePage + preloadCount);
    ensurePageWindowForRange(startIndex, endIndex);

    for (let index = startIndex; index <= endIndex; index += 1) {
      const page = pageCacheRef.current.get(index);
      if (!page) {
        continue;
      }

      const image = new Image();
      image.decoding = "async";
      image.src = getPageImageUrl(page.id);
    }
  }, [
    activePage,
    comic.totalPages,
    ensurePageWindowForRange,
    pageCache,
    preferences.readerPreloadAheadPages,
    preferences.readerPreloadEnabled,
  ]);

  useEffect(() => {
    function onPageHide() {
      saveProgress(activePageRef.current, "beacon");
    }

    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [saveProgress]);

  const retryPageWindow = useCallback(() => {
    const lastWindow = lastPageWindowRef.current;
    if (!lastWindow) {
      return;
    }

    requestedWindowsRef.current.delete(String(lastWindow.startIndex) + ":" + String(lastWindow.limit));
    setPageWindowError(null);
    void loadPageWindow(lastWindow.startIndex, lastWindow.limit);
  }, [loadPageWindow]);

  const firstChapterTitle = comic.chapters[0]?.title ?? "单章节";

  return (
    <Box component="main" className="reader-shell">
      <Box component="header" className={"reader-toolbar" + (toolbarVisible ? "" : " is-hidden")}>
        <Box
          component={Link}
          href={"/comics/" + comic.id}
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
            垂直阅读 · {activePage}/{Math.max(comic.totalPages, 1)}
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

      {pageWindowError ? (
        <Box className="reader-window-error" role="status">
          <span>{pageWindowError}</span>
          <AppButton variant="subtle" size="compact-xs" onClick={retryPageWindow}>
            重试
          </AppButton>
        </Box>
      ) : null}

      <Box className="reader-body">
        <Box
          component="nav"
          ref={thumbRailRef}
          className={"reader-thumb-rail" + (toolbarVisible && thumbnailSidebarVisible ? "" : " is-hidden")}
          aria-label="页面缩略图"
        >
          <Box className="reader-thumb-virtual-content" style={{ height: comic.totalPages * READER_THUMB_ROW_HEIGHT }}>
            {thumbVisibleRange.end >= thumbVisibleRange.start
              ? Array.from({ length: thumbVisibleRange.end - thumbVisibleRange.start + 1 }, (_, offset) => {
                  const pageIndex = thumbVisibleRange.start + offset;
                  const page = pageCache.get(pageIndex);
                  const pageNum = pageIndex + 1;

                  return (
                    <Box
                      component="div"
                      key={page?.id ?? pageIndex}
                      role="button"
                      tabIndex={0}
                      data-page={pageNum}
                      className={"reader-thumb-btn" + (pageNum === activePage ? " is-active" : "")}
                      aria-current={pageNum === activePage ? "page" : undefined}
                      aria-label={"跳转到第 " + String(pageNum) + " 页"}
                      style={{ top: pageIndex * READER_THUMB_ROW_HEIGHT }}
                      onClick={() => scrollToPage(pageNum)}
                      onKeyDown={(event) => handleThumbKeyDown(event, pageNum)}
                    >
                      <div className="reader-thumb-index">{pageNum}</div>
                      <div className="reader-thumb-sheet" aria-hidden="true">
                        {page ? (
                          <img
                            alt=""
                            className="reader-thumb-image"
                            decoding="async"
                            loading="lazy"
                            src={getPageThumbnailUrl(page.id)}
                          />
                        ) : (
                          <div className="reader-thumb-placeholder">PAGE {String(pageNum).padStart(2, "0")}</div>
                        )}
                      </div>
                    </Box>
                  );
                })
              : null}
          </Box>
        </Box>

        <Box component="section" ref={pagesContainerRef} className="reader-pages" aria-label="漫画页面">
          <Box className="reader-divider">
            <span>{firstChapterTitle}</span>
            <strong>{comic.displayTitle}</strong>
          </Box>
          {comic.totalPages > 0 ? (
            <Box className="reader-virtual-content" style={{ height: pageLayout.totalHeight }}>
              {pageVisibleRange.end >= pageVisibleRange.start
                ? Array.from({ length: pageVisibleRange.end - pageVisibleRange.start + 1 }, (_, offset) => {
                    const pageIndex = pageVisibleRange.start + offset;
                    const page = pageCache.get(pageIndex);
                    const layoutItem = pageLayout.items[pageIndex];
                    if (!layoutItem) {
                      return null;
                    }

                    const chapterTitle =
                      page?.chapterTitle ??
                      comic.chapters.find((chapter) => chapter.startIndex === pageIndex)?.title ??
                      "未命名章节";

                    return (
                      <div
                        key={page?.id ?? pageIndex}
                        className="reader-virtual-item"
                        data-page={pageIndex + 1}
                        style={{ top: layoutItem.top, height: layoutItem.itemHeight }}
                      >
                        {layoutItem.chapterDividerHeight > 0 ? (
                          <Box className="reader-divider reader-chapter-divider">
                            <span>{chapterTitle}</span>
                          </Box>
                        ) : null}
                        <Box
                          component="article"
                          className={"reader-page" + (page ? "" : " reader-page-placeholder")}
                          style={{ height: layoutItem.pageHeight }}
                        >
                          {page ? (
                            <img
                              alt={comic.displayTitle + " 第 " + String(pageIndex + 1) + " 页"}
                              className="reader-page-image"
                              decoding="async"
                              loading={pageIndex <= 1 ? "eager" : "lazy"}
                              src={getPageImageUrl(page.id)}
                            />
                          ) : (
                            <span>正在加载第 {pageIndex + 1} 页</span>
                          )}
                        </Box>
                      </div>
                    );
                  })
                : null}
            </Box>
          ) : (
            <Box className="reader-page reader-page-placeholder">
              <span>暂无页面</span>
              <p>{comic.displayTitle}</p>
            </Box>
          )}
          {queueContext && queueContext.nextComicId ? (
            <Box className="reader-divider reader-next-comic">
              <span>
                当前队列 {queueContext.position} / {queueContext.total}
              </span>
              <strong>下一本：{queueContext.nextComicTitle}</strong>
              <AppButton
                component={Link}
                href={"/reader/" + encodeURIComponent(queueContext.nextComicId)}
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

function createPageCache(pages: ReaderPageRecord[], startIndex: number) {
  return new Map(pages.map((page, offset) => [startIndex + offset, page]));
}

function getPageImageUrl(pageId: string) {
  return "/api/pages/" + encodeURIComponent(pageId);
}

function getPageThumbnailUrl(pageId: string) {
  return "/api/pages/" + encodeURIComponent(pageId) + "/thumbnail?w=176&h=264";
}

function parseReaderPageWindow(value: unknown): ReaderPageWindowRecord | null {
  if (
    !isRecord(value) ||
    typeof value.comicId !== "string" ||
    typeof value.startIndex !== "number" ||
    !Number.isInteger(value.startIndex)
  ) {
    return null;
  }
  if (typeof value.totalPages !== "number" || !Number.isInteger(value.totalPages) || !Array.isArray(value.pages)) {
    return null;
  }

  const pages = value.pages.filter(isReaderPageRecord);
  if (pages.length !== value.pages.length) {
    return null;
  }

  return {
    comicId: value.comicId,
    startIndex: value.startIndex,
    totalPages: value.totalPages,
    pages,
  };
}

function isReaderPageRecord(value: unknown): value is ReaderPageRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.chapterId === "string" &&
    (value.chapterTitle === null || typeof value.chapterTitle === "string") &&
    typeof value.pageNumber === "number" &&
    Number.isInteger(value.pageNumber) &&
    (value.width === null || typeof value.width === "number") &&
    (value.height === null || typeof value.height === "number")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
