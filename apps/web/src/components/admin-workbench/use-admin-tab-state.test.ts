import { afterEach, describe, expect, it } from "vitest";

import { createAdminTabState } from "./use-admin-tab-state";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("useAdminTabState hydration", () => {
  it("uses the initial value for the first render even when storage has a persisted value", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => JSON.stringify(20),
        },
      },
    });

    expect(createAdminTabState({ initialValue: 10, storageKey: "admin-tab:page-size" }).value).toBe(10);
  });
});
