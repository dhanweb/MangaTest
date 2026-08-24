import type { ReaderPageRecord } from "@/modules/library/comics.repository";

export const READER_CHAPTER_DIVIDER_HEIGHT = 86;
export const READER_FALLBACK_ASPECT_RATIO = 2 / 3;
export const READER_PAGE_OVERSCAN = 3;
export const READER_THUMB_ROW_HEIGHT = 140;
export const READER_THUMB_OVERSCAN = 8;

export interface ReaderVirtualChapter {
  startIndex: number;
}

export interface ReaderPageLayoutItem {
  index: number;
  top: number;
  pageHeight: number;
  itemHeight: number;
  chapterDividerHeight: number;
}

export interface ReaderPageLayout {
  items: ReaderPageLayoutItem[];
  totalHeight: number;
  contentWidth: number;
}

export interface ReaderVisibleRange {
  start: number;
  end: number;
}

export function buildReaderPageLayout(
  pages: Array<ReaderPageRecord | null>,
  chapters: ReaderVirtualChapter[],
  contentWidth: number,
  chapterDividerHeight = READER_CHAPTER_DIVIDER_HEIGHT,
  fallbackAspectRatio = READER_FALLBACK_ASPECT_RATIO,
): ReaderPageLayout {
  const safeWidth = Math.max(1, contentWidth);
  const safeFallbackRatio = fallbackAspectRatio > 0 ? fallbackAspectRatio : READER_FALLBACK_ASPECT_RATIO;
  const chapterStarts = new Set(chapters.map((chapter) => chapter.startIndex));
  const items: ReaderPageLayoutItem[] = [];
  let top = 0;

  pages.forEach((page, index) => {
    const ratio = page && page.width && page.height && page.width > 0 && page.height > 0
      ? page.width / page.height
      : safeFallbackRatio;
    const pageHeight = safeWidth / ratio;
    const dividerHeight = index > 0 && chapterStarts.has(index) ? Math.max(0, chapterDividerHeight) : 0;
    const itemHeight = dividerHeight + pageHeight;

    items.push({ index, top, pageHeight, itemHeight, chapterDividerHeight: dividerHeight });
    top += itemHeight;
  });

  return { items, totalHeight: top, contentWidth: safeWidth };
}

export function findPageIndexAtOffset(layout: ReaderPageLayout, offset: number) {
  if (layout.items.length === 0) {
    return -1;
  }

  const target = Math.max(0, offset);
  let low = 0;
  let high = layout.items.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const item = layout.items[middle];
    const next = layout.items[middle + 1];

    if (item.top <= target && (!next || target < next.top)) {
      return item.index;
    }

    if (item.top > target) {
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return layout.items.length - 1;
}

export function getVisiblePageRange(
  layout: ReaderPageLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = READER_PAGE_OVERSCAN,
): ReaderVisibleRange {
  if (layout.items.length === 0) {
    return { start: 0, end: -1 };
  }

  const firstVisible = findPageIndexAtOffset(layout, Math.max(0, scrollTop));
  const lastVisible = findPageIndexAtOffset(layout, Math.max(0, scrollTop) + Math.max(1, viewportHeight));
  const safeOverscan = Math.max(0, Math.trunc(overscan));

  return {
    start: Math.max(0, firstVisible - safeOverscan),
    end: Math.min(layout.items.length - 1, lastVisible + safeOverscan),
  };
}

export function getPageScrollTop(layout: ReaderPageLayout, pageIndex: number, viewportHeight: number) {
  const item = layout.items[Math.max(0, Math.min(layout.items.length - 1, Math.trunc(pageIndex)))];
  if (!item) {
    return 0;
  }

  return Math.max(0, item.top + item.chapterDividerHeight - Math.max(0, viewportHeight - item.pageHeight) / 2);
}

export function getThumbnailVisibleRange(
  totalPages: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = READER_THUMB_ROW_HEIGHT,
  overscan = READER_THUMB_OVERSCAN,
): ReaderVisibleRange {
  if (totalPages <= 0) {
    return { start: 0, end: -1 };
  }

  const safeRowHeight = Math.max(1, rowHeight);
  const safeOverscan = Math.max(0, Math.trunc(overscan));
  const firstVisible = Math.max(0, Math.floor(Math.max(0, scrollTop) / safeRowHeight));
  const lastVisible = Math.min(totalPages - 1, Math.ceil((Math.max(0, scrollTop) + Math.max(1, viewportHeight)) / safeRowHeight));

  return {
    start: Math.max(0, firstVisible - safeOverscan),
    end: Math.min(totalPages - 1, lastVisible + safeOverscan),
  };
}
