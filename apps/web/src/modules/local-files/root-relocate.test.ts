import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { moveMangaRootContents, validateRootRelocatePaths } from "./root-relocate";

describe("root-relocate", () => {
  it("rejects nested destination under source", () => {
    const source = path.join("D:", "data", "manga_store");
    const destination = path.join("D:", "data", "manga_store", "nested");
    const result = validateRootRelocatePaths({ sourcePath: source, destinationPath: destination });
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/嵌套/);
  });

  it("rejects identical source and destination", () => {
    const root = path.join("D:", "data", "manga_store");
    const result = validateRootRelocatePaths({ sourcePath: root, destinationPath: root });
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/相同/);
  });

  it("moves directory and archive children to the new root", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-root-move-${randomUUID()}`);
    const source = path.join(workspace, "old-root");
    const destination = path.join(workspace, "new-root");
    await mkdir(path.join(source, "Comic A"), { recursive: true });
    await writeFile(path.join(source, "Comic A", "001.jpg"), "img");
    await writeFile(path.join(source, "Comic B.cbz"), "zip-bytes");

    const result = await moveMangaRootContents({ sourcePath: source, destinationPath: destination });
    expect(result.movedEntryCount).toBe(2);
    await expect(readFile(path.join(destination, "Comic A", "001.jpg"), "utf8")).resolves.toBe("img");
    await expect(readFile(path.join(destination, "Comic B.cbz"), "utf8")).resolves.toBe("zip-bytes");
    await expect(access(path.join(source, "Comic A"))).rejects.toBeTruthy();
  });

  it("refuses non-empty destination", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-root-move-nonempty-${randomUUID()}`);
    const source = path.join(workspace, "old-root");
    const destination = path.join(workspace, "new-root");
    await mkdir(source, { recursive: true });
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(source, "a.cbz"), "a");
    await writeFile(path.join(destination, "keep.txt"), "keep");

    await expect(moveMangaRootContents({ sourcePath: source, destinationPath: destination })).rejects.toThrow(/空目录/);
  });
});
