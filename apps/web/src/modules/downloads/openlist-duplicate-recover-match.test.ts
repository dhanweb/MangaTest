import { describe, expect, it } from "vitest";

import { matchArchiveInIndex } from "./openlist-duplicate-recover";

describe("matchArchiveInIndex", () => {
  const root = "/115Open/HENTAI/exhentai";

  it("matches unique manga directory to zip", () => {
    const result = matchArchiveInIndex({
      root,
      hints: ["My Comic Title"],
      archives: [
        {
          remotePath: `${root}/My Comic Title/My Comic Title.zip`,
          parentPath: `${root}/My Comic Title`,
          name: "My Comic Title.zip",
          sizeBytes: 1000,
          depth: 2,
        },
      ],
      entries: [
        {
          remotePath: `${root}/My Comic Title`,
          parentPath: root,
          name: "My Comic Title",
          kind: "directory",
          sizeBytes: null,
        },
      ],
    });
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.remotePath.endsWith(".zip")).toBe(true);
      expect(result.fileName).toBe("My Comic Title.zip");
    }
  });

  it("returns not_found when no match", () => {
    const result = matchArchiveInIndex({
      root,
      hints: ["Unknown"],
      archives: [
        {
          remotePath: `${root}/Other/Other.zip`,
          parentPath: `${root}/Other`,
          name: "Other.zip",
          sizeBytes: 1,
          depth: 2,
        },
      ],
    });
    expect(result.status).toBe("not_found");
  });
});
