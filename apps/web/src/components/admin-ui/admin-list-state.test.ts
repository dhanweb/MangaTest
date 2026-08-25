import { describe, expect, it } from "vitest";

import { clampPage, getRowNumber, getSelectablePageKeys, togglePageSelection } from "./admin-list-state";

describe("admin list state", () => {
  it("clamps a page after filtering or deletion", () => {
    expect(clampPage(4, 21, 10)).toBe(3);
    expect(clampPage(2, 0, 10)).toBe(1);
  });

  it("calculates sequence numbers across pages", () => {
    expect(getRowNumber(0, 3, 20)).toBe(41);
    expect(getRowNumber(19, 3, 20)).toBe(60);
  });

  it("selects enabled current-page rows without discarding another page", () => {
    const rows = [
      { id: "a", disabled: false },
      { id: "b", disabled: true },
      { id: "c", disabled: false },
    ];
    const pageKeys = getSelectablePageKeys(rows, (row) => row.id, (row) => !row.disabled);

    expect(pageKeys).toEqual(["a", "c"]);
    expect(togglePageSelection(new Set(["outside"]), pageKeys, true)).toEqual(new Set(["outside", "a", "c"]));
    expect(togglePageSelection(new Set(["outside", "a", "c"]), pageKeys, false)).toEqual(new Set(["outside"]));
  });

  it("keeps selection from another page when the current page is changed", () => {
    const selected = new Set(["page-1", "page-2"]);
    const next = togglePageSelection(selected, ["page-3", "page-4"], true);

    expect(next).toEqual(new Set(["page-1", "page-2", "page-3", "page-4"]));
  });
});
