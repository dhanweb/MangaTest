import { describe, expect, it } from "vitest";

import { insertItemAt } from "./order-utils";

const items = ["1", "2", "3", "4"].map((id) => ({ id }));

describe("insertItemAt", () => {
  it("inserts an item at its requested final 1-based position", () => {
    expect(insertItemAt(items, "4", 3).map((item) => item.id)).toEqual(["1", "2", "4", "3"]);
  });

  it("moves an earlier item down and shifts the displaced items up", () => {
    expect(insertItemAt(items, "1", 3).map((item) => item.id)).toEqual(["2", "3", "1", "4"]);
  });

  it("clamps positions outside the list to the first or last slot", () => {
    expect(insertItemAt(items, "3", 0).map((item) => item.id)).toEqual(["3", "1", "2", "4"]);
    expect(insertItemAt(items, "1", 99).map((item) => item.id)).toEqual(["2", "3", "4", "1"]);
  });

  it("truncates fractional positions and leaves unknown items unchanged", () => {
    expect(insertItemAt(items, "4", 2.9).map((item) => item.id)).toEqual(["1", "4", "2", "3"]);
    expect(insertItemAt(items, "missing", 2).map((item) => item.id)).toEqual(["1", "2", "3", "4"]);
  });
});
