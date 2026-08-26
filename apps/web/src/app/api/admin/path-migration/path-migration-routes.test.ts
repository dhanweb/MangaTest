import { randomUUID } from "node:crypto";
import { access, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("path migration API", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    delete process.env.MANGATEST_PATH_PROFILE;
  });

  it("keeps preview read-only and returns a typed report", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-path-api-preview-${randomUUID()}`);
    const rootPath = path.join(workspace, "root");
    const dbPath = path.join(workspace, "test.sqlite");
    await mkdir(rootPath, { recursive: true });
    process.env.MANGATEST_DB_PATH = dbPath;
    process.env.MANGATEST_PATH_PROFILE = "windows";

    const { createMangaRootRepository } = await import("@/modules/library/manga-roots.repository");
    const { getDb, getSqlite, mangaRoots } = await import("@/modules/core/db");
    const { POST } = await import("./preview/route");
    const root = await createMangaRootRepository().create({ absolutePath: rootPath, displayName: "API preview" });
    const before = getDb().select({ absolutePath: mangaRoots.absolutePath }).from(mangaRoots).where(eq(mangaRoots.id, root.id)).get();

    const response = await POST(
      new Request("http://localhost/api/admin/path-migration/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetProfile: "windows", rootMappings: [{ rootId: root.id, targetPath: rootPath }] }),
      }),
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(isRecord(payload) && payload.sourceProfile).toBe("windows");
    expect(isRecord(payload) && payload.canApply).toBe(true);
    expect(getDb().select({ absolutePath: mangaRoots.absolutePath }).from(mangaRoots).get()?.absolutePath).toBe(before?.absolutePath);
    await expect(access(dbPath)).resolves.toBeUndefined();

    getSqlite().close();
    await rm(workspace, { recursive: true, force: true });
  });

  it("rejects apply without backup confirmation and does not echo filesystem paths", async () => {
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = path.join(os.tmpdir(), `mangatest-path-api-apply-${randomUUID()}.sqlite`);
    process.env.MANGATEST_PATH_PROFILE = "windows";

    const { POST } = await import("./apply/route");
    const response = await POST(
      new Request("http://localhost/api/admin/path-migration/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetProfile: "windows",
          rootMappings: [{ rootId: "root", targetPath: "C:\\private\\library" }],
          fingerprint: "a".repeat(64),
          confirmBackup: false,
        }),
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("备份");
    expect(body).not.toContain("C:\\private\\library");
  });

  it("returns 400 for an invalid target path without echoing it", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-path-api-invalid-${randomUUID()}`);
    const rootPath = path.join(workspace, "root");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "windows";
    await mkdir(rootPath, { recursive: true });

    const { createMangaRootRepository } = await import("@/modules/library/manga-roots.repository");
    const { getSqlite } = await import("@/modules/core/db");
    const { POST } = await import("./preview/route");
    const root = await createMangaRootRepository().create({ absolutePath: rootPath, displayName: "API invalid" });

    const invalidTargetPath = "relative/private/library";
    const response = await POST(
      new Request("http://localhost/api/admin/path-migration/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetProfile: "windows", rootMappings: [{ rootId: root.id, targetPath: invalidTargetPath }] }),
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("路径迁移参数无效");
    expect(body).not.toContain(invalidTargetPath);
    getSqlite().close();
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
