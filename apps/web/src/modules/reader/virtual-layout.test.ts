import { describe, expect, it } from "vitest";

import {
  buildReaderPageLayout,
  findPageIndexAtOffset,
  getPageScrollTop,
  getThumbnailVisibleRange,
  getVisiblePageRange,
} from "./virtual-layout";

function page(id: string, width = 100, height = 150) {
  return { id, chapterId: "chapter", chapterTitle: null, pageNumber: 1, width, height };
}

describe("reader virtual layout", () => {
  it("reserves stable variable-height positions and chapter dividers", () => {
    const layout = buildReaderPageLayout(
      [page("one"), page("two", 100, 100), page("three")],
      [{ startIndex: 0 }, { startIndex: 2 }],
      100,
    );

    expect(layout.items).toEqual([
      { index: 0, top: 0, pageHeight: 150, itemHeight: 150, chapterDividerHeight: 0 },
      { index: 1, top: 150, pageHeight: 100, itemHeight: 100, chapterDividerHeight: 0 },
      { index: 2, top: 250, pageHeight: 150, itemHeight: 236, chapterDividerHeight: 86 },
    ]);
    expect(layout.totalHeight).toBe(486);
  });

  it("uses a fallback ratio for unloaded or invalid dimensions", () => {
    const layout = buildReaderPageLayout([null, page("invalid", 0, 0)], [], 120);

    expect(layout.items.map((item) => item.pageHeight)).toEqual([180, 180]);
  });

  it("finds page and viewport ranges with clamped overscan", () => {
    const layout = buildReaderPageLayout([page("one"), page("two"), page("three"), page("four")], [], 100);

    expect(findPageIndexAtOffset(layout, -10)).toBe(0);
    expect(findPageIndexAtOffset(layout, 151)).toBe(1);
    expect(findPageIndexAtOffset(layout, 9999)).toBe(3);
    expect(getVisiblePageRange(layout, 150, 150, 1)).toEqual({ start: 0, end: 3 });
    expect(getPageScrollTop(layout, 2, 200)).toBe(275);
  });

  it("keeps thumbnail range bounded for empty and large rails", () => {
    expect(getThumbnailVisibleRange(0, 0, 800)).toEqual({ start: 0, end: -1 });
    expect(getThumbnailVisibleRange(6170, 1400, 700, 140, 2)).toEqual({ start: 8, end: 17 });
  });
});
