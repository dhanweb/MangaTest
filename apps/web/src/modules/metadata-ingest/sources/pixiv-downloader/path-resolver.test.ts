import { describe, expect, it } from "vitest";

import {
  createPixivPathResolver,
  isPathInsideRoot,
  normalizePathForComparison,
} from "./path-resolver";

describe("createPixivPathResolver", () => {
  const downloadRoot = "D:\\hentai\\pixiv";
  const prefixes = [{ id: 1, path: "D:\\hentai\\pixiv-alt" }];

  function resolver() {
    return createPixivPathResolver({ downloadRoot, pathPrefixes: prefixes });
  }

  it("resolves {0} to the configured download root", () => {
    const result = resolver().resolve({ folder: "{0}/116308589", moveFolder: null, moved: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe("D:\\hentai\\pixiv\\116308589");
      expect(result.usedMoveFolder).toBe(false);
    }
  });

  it("resolves {N} through path_prefixes", () => {
    const result = resolver().resolve({ folder: "{1}/116308589", moveFolder: null, moved: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe("D:\\hentai\\pixiv-alt\\116308589");
    }
  });

  it("prefers move_folder when moved is set and move_folder is non-empty", () => {
    const result = resolver().resolve({
      folder: "{0}/old",
      moveFolder: "{1}/new",
      moved: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe("D:\\hentai\\pixiv-alt\\new");
      expect(result.usedMoveFolder).toBe(true);
    }
  });

  it("ignores move_folder when moved is not set", () => {
    const result = resolver().resolve({
      folder: "{0}/old",
      moveFolder: "{1}/new",
      moved: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe("D:\\hentai\\pixiv\\old");
      expect(result.usedMoveFolder).toBe(false);
    }
  });

  it("reports unknown {N} prefix as a path failure", () => {
    const result = resolver().resolve({ folder: "{9}/116308589", moveFolder: null, moved: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toEqual({ kind: "unknown_prefix", placeholder: "{9}" });
    }
  });

  it("detects path escape outside all allowed roots", () => {
    const result = resolver().resolve({ folder: "{0}/../../secret", moveFolder: null, moved: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("path_escape");
      expect(result.failure.kind === "path_escape" ? result.failure.resolvedPath : "").toBe("D:\\secret");
    }
  });

  it("detects escape for absolute folders outside the roots", () => {
    const result = resolver().resolve({ folder: "E:\\other\\library\\116308589", moveFolder: null, moved: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("path_escape");
    }
  });

  it("resolves relative folders without placeholders against the download root", () => {
    const result = resolver().resolve({ folder: "116308589", moveFolder: null, moved: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe("D:\\hentai\\pixiv\\116308589");
    }
  });

  it("normalizes mixed separators and redundant segments", () => {
    const result = resolver().resolve({ folder: "{0}\\./sub\\../116308589", moveFolder: null, moved: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe("D:\\hentai\\pixiv\\116308589");
    }
  });

  it("reports empty folder as a failure", () => {
    const result = resolver().resolve({ folder: "  ", moveFolder: null, moved: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("empty_folder");
    }
  });
});

describe("normalizePathForComparison", () => {
  it("normalizes separators, drive letter case, and trailing slashes", () => {
    expect(normalizePathForComparison("D:\\Hentai\\Pixiv\\116308589/")).toBe(
      normalizePathForComparison("d:/hentai/pixiv/116308589"),
    );
  });

  it("keeps UNC paths comparable", () => {
    expect(normalizePathForComparison("\\\\server\\share\\a")).toBe(
      normalizePathForComparison("\\\\SERVER\\share\\a"),
    );
  });
});

describe("isPathInsideRoot", () => {
  it("accepts the root itself and children, rejects siblings and parents", () => {
    const root = "D:\\hentai\\pixiv";
    expect(isPathInsideRoot("D:\\hentai\\pixiv", root)).toBe(true);
    expect(isPathInsideRoot("D:\\hentai\\pixiv\\116308589", root)).toBe(true);
    expect(isPathInsideRoot("D:\\hentai\\pixiv-other\\116308589", root)).toBe(false);
    expect(isPathInsideRoot("D:\\hentai", root)).toBe(false);
  });
});
