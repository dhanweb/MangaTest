import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("RootLocationService", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    delete process.env.MANGATEST_PATH_PROFILE;
  });

  it("verifies available, offline, invalid, and unconfigured locations", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-root-location-service-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "windows";
    await mkdir(workspace, { recursive: true });

    const { bootstrapDatabase, getDb, mangaRootLocations, mangaRoots } = await import("../core/db");
    const { createMangaRootLocationRepository } = await import("./manga-root-locations.repository");
    const { createRootLocationService } = await import("./root-location.service");
    bootstrapDatabase();
    const db = getDb();
    const availableRootId = randomUUID();
    const offlineRootId = randomUUID();
    const invalidRootId = randomUUID();
    const unconfiguredRootId = randomUUID();
    const availablePath = path.join(workspace, "available");
    const filePath = path.join(workspace, "not-a-directory");
    await mkdir(availablePath, { recursive: true });
    await (await import("node:fs/promises")).writeFile(filePath, "fixture");

    db.insert(mangaRoots)
      .values([
        { id: availableRootId, absolutePath: availablePath, scanMode: "children_as_comics" },
        { id: offlineRootId, absolutePath: path.join(workspace, "offline"), scanMode: "children_as_comics" },
        { id: invalidRootId, absolutePath: filePath, scanMode: "children_as_comics" },
        { id: unconfiguredRootId, absolutePath: path.join(workspace, "unconfigured"), scanMode: "children_as_comics" },
      ])
      .run();

    const repository = createMangaRootLocationRepository();
    repository.upsert({ mangaRootId: availableRootId, runtimeProfile: "windows", absolutePath: availablePath });
    repository.upsert({ mangaRootId: offlineRootId, runtimeProfile: "windows", absolutePath: path.join(workspace, "offline") });
    repository.upsert({ mangaRootId: invalidRootId, runtimeProfile: "windows", absolutePath: filePath });

    const service = createRootLocationService();
    await expect(service.resolveMangaRoot(availableRootId)).resolves.toMatchObject({ status: "available", absolutePath: availablePath });
    await expect(service.resolveMangaRoot(offlineRootId)).resolves.toMatchObject({ status: "offline" });
    await expect(service.resolveMangaRoot(invalidRootId)).resolves.toMatchObject({ status: "invalid" });
    await expect(service.resolveMangaRoot(unconfiguredRootId)).resolves.toEqual({ status: "unconfigured", profile: "windows" });

    await expect(service.resolveMangaFile(availableRootId, "Comic/001.jpg")).resolves.toBe(
      path.join(availablePath, "Comic", "001.jpg"),
    );
    await expect(service.resolveMangaFile(availableRootId, "../outside.jpg")).rejects.toMatchObject({ code: "relative_path_invalid" });
    await expect(service.resolveMangaFile(offlineRootId, "Comic/001.jpg")).rejects.toMatchObject({ code: "root_offline" });

    const availableLocation = db
      .select({ status: mangaRootLocations.verificationStatus })
      .from(mangaRootLocations)
      .where(eq(mangaRootLocations.mangaRootId, availableRootId))
      .get();
    expect(availableLocation?.status).toBe("available");
  });
});
