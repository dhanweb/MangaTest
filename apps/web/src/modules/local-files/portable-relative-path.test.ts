import path from "node:path";

import { describe, expect, it } from "vitest";

import { parsePortableRelativePath, resolvePortableChild, toPortableRelativePath } from "./portable-relative-path";

describe("portable relative paths", () => {
  it("converts native separators", () => {
    expect(toPortableRelativePath("Comic\\001.jpg")).toBe("Comic/001.jpg");
  });

  it.each(["/etc/passwd", "D:/comic", "D:\\comic", "//server/share", "../comic", "comic/../page.jpg", "comic\0page.jpg"])(
    "rejects %s",
    (value) => {
      expect(() => parsePortableRelativePath(value)).toThrow();
    },
  );

  it("resolves inside the configured root", () => {
    const root = path.resolve("library");
    expect(resolvePortableChild(root, parsePortableRelativePath("Comic/001.jpg"))).toBe(
      path.join(root, "Comic", "001.jpg"),
    );
  });
});
