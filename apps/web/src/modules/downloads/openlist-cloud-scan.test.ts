import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

describe("OpenList cloud directory scans", () => {
  it("persists a read-only directory scan without storing private links", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-cloud-scan-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    const comicId = randomUUID();
    const sourceId = randomUUID();
    const resourceId = randomUUID();
    const requests: Array<{ authorization: string | null; body: Record<string, unknown>; method: string; url: string }> = [];

    await mkdir(workspace, { recursive: true });
    process.env.MANGATEST_DB_PATH = dbPath;

    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requests.push({
        authorization: new Headers(init?.headers).get("Authorization"),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return Response.json({
        code: 200,
        data: {
          content: [
            { is_dir: true, modified: "2026-01-01T00:00:00Z", name: "Series", provider: "Local", raw_url: "", size: 0, type: 1 },
            {
              is_dir: false,
              modified: "2026-01-02T00:00:00Z",
              name: "Comic.cbz",
              provider: "Local",
              raw_url: "https://private.example/download/Comic.cbz?sign=secret",
              size: 1048576,
              type: 4,
            },
          ],
          has_more: false,
          page: 1,
          per_page: 50,
          provider: "Local",
          total: 2,
        },
        message: "success",
      });
    });

    try {
      const { bootstrapDatabase, getSqlite } = await import("../core/db");
      const { saveRuntimeSettings } = await import("../core/settings");
      const { createOpenListCloudDirectoryScan, listOpenListCloudScans } = await import("./index");

      bootstrapDatabase();
      const sqlite = getSqlite();
      sqlite
        .prepare("insert into comics (id, display_title, file_title, sort_title, status) values (?, ?, ?, ?, ?)")
        .run(comicId, "Cloud Comic", "Cloud Comic", "cloud comic", "remote_only");
      sqlite
        .prepare("insert into comic_sources (id, comic_id, site, source_url, original_title) values (?, ?, ?, ?, ?)")
        .run(sourceId, comicId, "openlist", "https://example.test/cloud-comic", "Cloud Comic");
      sqlite
        .prepare(
          "insert into comic_resources (id, comic_id, comic_source_id, resource_type, display_label, resource_url, redacted_resource) values (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(resourceId, comicId, sourceId, "openlist", "OpenList 目录", "openlist:/Library", "openlist:...");

      await saveRuntimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244/root",
        openlistEnabled: true,
        openlistToken: "secret-openlist-token",
      });

      const result = await createOpenListCloudDirectoryScan({ comicResourceId: resourceId });
      const scans = await listOpenListCloudScans();
      const persistedEntryCount = countRows(sqlite, "cloud_scan_entries");

      expect(result.scan.status).toBe("completed");
      expect(result.scan.rootPath).toBe("/Library");
      expect(result.scan.totalCount).toBe(2);
      expect(result.scan.fileCount).toBe(1);
      expect(result.scan.directoryCount).toBe(1);
      expect(result.scan.importableFileCount).toBe(1);
      expect(result.scan.previewEntries.map((entry) => entry.name).sort()).toEqual(["Comic.cbz", "Series"]);
      expect(scans[0]?.id).toBe(result.scan.id);
      expect(persistedEntryCount).toBe(2);
      expect(requests[0]).toMatchObject({
        authorization: "secret-openlist-token",
        body: {
          page: 1,
          password: "",
          path: "/Library",
          per_page: 50,
          refresh: false,
        },
        method: "POST",
        url: "http://127.0.0.1:5244/root/api/fs/list",
      });
      expect(JSON.stringify(result)).not.toContain("secret-openlist-token");
      expect(JSON.stringify(result)).not.toContain("private.example");
      expect(JSON.stringify(result)).not.toContain("sign=secret");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function countRows(sqlite: { prepare: (sql: string) => { get: () => unknown } }, tableName: string) {
  const row = sqlite.prepare(`select count(*) as count from ${tableName}`).get() as { count: number };
  return row.count;
}
