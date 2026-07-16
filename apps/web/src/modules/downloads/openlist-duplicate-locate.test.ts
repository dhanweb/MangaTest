import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT,
  buildDuplicateNotFoundMessage,
  isOpenListArchiveName,
  locateArchiveUnderOpenListRoot,
  normalizeOpenListMatchName,
  scoreOpenListNameMatch,
  type LocateListDirectory,
  type LocateListEntry,
} from "./openlist-duplicate-locate";

function dir(name: string): LocateListEntry {
  return { name, isDirectory: true, sizeBytes: null };
}

function file(name: string, sizeBytes = 10): LocateListEntry {
  return { name, isDirectory: false, sizeBytes };
}

function listFromTree(tree: Record<string, LocateListEntry[]>): LocateListDirectory {
  return async (path) => {
    const normalized = path.replace(/\/+$/, "") || "/";
    const entries = tree[normalized];
    if (!entries) {
      return { ok: false, entries: [], hasMore: false, message: `missing ${normalized}` };
    }
    return { ok: true, entries, hasMore: false };
  };
}

describe("openlist-duplicate-locate", () => {
  it("normalizes names and scores exact/include matches", () => {
    expect(normalizeOpenListMatchName("  Foo Bar.ZIP ")).toBe("foo bar");
    expect(isOpenListArchiveName("a.cbz")).toBe(true);
    expect(scoreOpenListNameMatch("Foo Bar", ["foo bar"])).toBe(100);
    expect(scoreOpenListNameMatch("Foo Bar Complete", ["Foo Bar"])).toBe(80);
  });

  it("finds zip under flat root/mangaDir", async () => {
    const root = DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT;
    const manga = "My Comic Title";
    const result = await locateArchiveUnderOpenListRoot({
      root,
      hints: ["My Comic Title"],
      listDirectory: listFromTree({
        [root]: [dir(manga), dir("Other")],
        [`${root}/${manga}`]: [file("My Comic Title.zip", 2048)],
      }),
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.remotePath).toBe(`${root}/${manga}/My Comic Title.zip`);
      expect(result.fileName).toBe("My Comic Title.zip");
      expect(result.mangaDirName).toBe(manga);
    }
  });

  it("returns not_found when no name matches", async () => {
    const root = DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT;
    const result = await locateArchiveUnderOpenListRoot({
      root,
      hints: ["Missing Title"],
      listDirectory: listFromTree({
        [root]: [dir("Something Else")],
        [`${root}/Something Else`]: [file("a.zip")],
      }),
    });
    expect(result.status).toBe("not_found");
  });

  it("returns ambiguous when multiple high-confidence manga dirs match", async () => {
    const root = DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT;
    const result = await locateArchiveUnderOpenListRoot({
      root,
      hints: ["Shared"],
      listDirectory: listFromTree({
        [root]: [dir("Shared A"), dir("Shared B")],
        [`${root}/Shared A`]: [file("a.zip", 1)],
        [`${root}/Shared B`]: [file("b.zip", 2)],
      }),
    });
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("accepts a loose zip directly under root", async () => {
    const root = DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT;
    const result = await locateArchiveUnderOpenListRoot({
      root,
      hints: ["Loose Comic"],
      listDirectory: listFromTree({
        [root]: [file("Loose Comic.zip", 99)],
      }),
    });
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.remotePath).toBe(`${root}/Loose Comic.zip`);
      expect(result.mangaDirName).toBeNull();
    }
  });

  it("builds not-found message with root and retry hint", () => {
    const message = buildDuplicateNotFoundMessage(DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT, "任务已存在");
    expect(message).toContain("10008");
    expect(message).toContain(DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT);
    expect(message).toContain("重试");
  });
});
