import path from "node:path";
import { describe, expect, it } from "vitest";

function isPathInsideParent(parentPath: string, childPath: string) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

describe("aria2 direct placement path rules", () => {
  it("treats import-root downloads as final paths (no move needed)", () => {
    const importRoot = "D:\\library\\下载入库";
    const downloaded = "D:\\library\\下载入库\\Comic.cbz";
    const tempDir = "D:\\app\\.data\\cache\\downloads\\tmp\\task-1";
    expect(isPathInsideParent(importRoot, downloaded)).toBe(true);
    expect(isPathInsideParent(tempDir, downloaded)).toBe(false);
  });

  it("still recognizes legacy cache temp downloads", () => {
    const importRoot = "D:\\library\\下载入库";
    const tempDir = "D:\\app\\.data\\cache\\downloads\\tmp\\task-1";
    const downloaded = "D:\\app\\.data\\cache\\downloads\\tmp\\task-1\\file.cbz";
    expect(isPathInsideParent(tempDir, downloaded)).toBe(true);
    expect(isPathInsideParent(importRoot, downloaded)).toBe(false);
  });
});
