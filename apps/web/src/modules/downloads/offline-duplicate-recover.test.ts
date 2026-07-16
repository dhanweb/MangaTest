import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT } from "./openlist-duplicate-locate";
import { isOpenListDuplicateOfflineError } from "./providers/openlist/connection";

describe("OpenList offline duplicate recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MANGATEST_DB_PATH;
  });

  it("classifies nested 10008 message text", () => {
    expect(isOpenListDuplicateOfflineError(10008, "x")).toBe(true);
    expect(
      isOpenListDuplicateOfflineError(
        500,
        "failed to add offline download task: code: 10008, message: 任务已存在，请勿输入重复的链接地址",
      ),
    ).toBe(true);
    expect(isOpenListDuplicateOfflineError(200, "ok")).toBe(false);
  });

  it("on 10008 locates archive under flat root and creates one transfer", async () => {
    const root = DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT;
    const mangaName = "Recovered Comic";
    const requests: string[] = [];

    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      requests.push(`${init?.method ?? "GET"} ${url}`);

      if (url.includes("/api/fs/add_offline_download")) {
        return Response.json({
          code: 500,
          message: "failed to add offline download task: code: 10008, message: 任务已存在，请勿输入重复的链接地址",
        });
      }

      if (url.includes("/api/fs/list")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { path?: string; page?: number };
        const listPath = String(body.path ?? "").replace(/\/+$/, "");
        if (listPath === root) {
          return Response.json({
            code: 200,
            data: {
              content: [
                {
                  name: mangaName,
                  is_dir: true,
                  size: 0,
                  modified: "2026-01-01T00:00:00Z",
                },
              ],
              total: 1,
            },
            message: "success",
          });
        }
        if (listPath === `${root}/${mangaName}`) {
          return Response.json({
            code: 200,
            data: {
              content: [
                {
                  name: `${mangaName}.zip`,
                  is_dir: false,
                  size: 4096,
                  modified: "2026-01-01T00:00:00Z",
                },
              ],
              total: 1,
            },
            message: "success",
          });
        }
        return Response.json({ code: 200, data: { content: [], total: 0 }, message: "success" });
      }

      // transfer may probe get/link later; keep offline recovery focused
      return Response.json({ code: 200, data: {}, message: "success" });
    });

    const workspace = path.join(os.tmpdir(), `mangatest-dup-recover-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    const rootPath = path.join(workspace, "Root");
    await mkdir(rootPath, { recursive: true });
    process.env.MANGATEST_DB_PATH = dbPath;

    const { bootstrapDatabase, getSqlite } = await import("../core/db");
    const { saveRuntimeSettings } = await import("../core/settings");
    const { createDownloadTask, listDownloadTasks } = await import("./index");

    bootstrapDatabase();
    const sqlite = getSqlite();
    const comicId = randomUUID();
    const mangaRootId = randomUUID();
    const sourceId = randomUUID();
    const resourceId = randomUUID();

    sqlite
      .prepare("insert into manga_roots (id, absolute_path, display_name, scan_mode, is_enabled) values (?, ?, ?, ?, ?)")
      .run(mangaRootId, rootPath, "Root", "children_as_comics", 1);
    sqlite
      .prepare("insert into comics (id, display_title, file_title, sort_title, status) values (?, ?, ?, ?, ?)")
      .run(comicId, mangaName, mangaName, "recovered comic", "remote_only");
    sqlite
      .prepare("insert into comic_sources (id, comic_id, site, source_url, original_title) values (?, ?, ?, ?, ?)")
      .run(sourceId, comicId, "plugin", "https://example.test/comic", mangaName);
    sqlite
      .prepare(
        "insert into comic_resources (id, comic_id, comic_source_id, resource_type, display_label, resource_url, redacted_resource) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        resourceId,
        comicId,
        sourceId,
        "magnet",
        mangaName,
        "magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01",
        "magnet:?xt=urn:btih:...",
      );

    await saveRuntimeSettings({
      cacheDirectory: path.join(workspace, "cache"),
      openlistBaseUrl: "http://127.0.0.1:5244",
      openlistEnabled: true,
      openlistToken: "secret-openlist-token",
    });

    const created = await createDownloadTask({ comicResourceId: resourceId, provider: "openlist" });
    expect(created.created).toBe(true);

    const tasks = await listDownloadTasks(20);
    const offline = tasks.find((task) => task.taskType === "offline");
    const transfers = tasks.filter((task) => task.taskType === "transfer");

    expect(offline?.status).toBe("completed");
    expect(offline?.remotePath).toBe(`${root}/${mangaName}/${mangaName}.zip`);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.remotePath).toBe(`${root}/${mangaName}/${mangaName}.zip`);
    expect(requests.filter((item) => item.includes("add_offline_download"))).toHaveLength(1);
  });

  it("on 10008 with empty library fails with root guidance", async () => {
    const root = DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT;

    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url.includes("/api/fs/add_offline_download")) {
        return Response.json({
          code: 10008,
          message: "任务已存在，请勿输入重复的链接地址",
        });
      }
      if (url.includes("/api/fs/list")) {
        return Response.json({
          code: 200,
          data: { content: [], total: 0 },
          message: "success",
        });
      }
      return Response.json({ code: 200, data: {}, message: "success" });
    });

    const workspace = path.join(os.tmpdir(), `mangatest-dup-miss-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    const localRoot = path.join(workspace, "Root");
    await mkdir(localRoot, { recursive: true });
    process.env.MANGATEST_DB_PATH = dbPath;

    const { bootstrapDatabase, getSqlite } = await import("../core/db");
    const { saveRuntimeSettings } = await import("../core/settings");
    const { createDownloadTask, listDownloadTasks } = await import("./index");

    bootstrapDatabase();
    const sqlite = getSqlite();
    const comicId = randomUUID();
    const mangaRootId = randomUUID();
    const sourceId = randomUUID();
    const resourceId = randomUUID();
    const mangaName = "Missing Comic";

    sqlite
      .prepare("insert into manga_roots (id, absolute_path, display_name, scan_mode, is_enabled) values (?, ?, ?, ?, ?)")
      .run(mangaRootId, localRoot, "Root", "children_as_comics", 1);
    sqlite
      .prepare("insert into comics (id, display_title, file_title, sort_title, status) values (?, ?, ?, ?, ?)")
      .run(comicId, mangaName, mangaName, "missing comic", "remote_only");
    sqlite
      .prepare("insert into comic_sources (id, comic_id, site, source_url, original_title) values (?, ?, ?, ?, ?)")
      .run(sourceId, comicId, "plugin", "https://example.test/missing", mangaName);
    sqlite
      .prepare(
        "insert into comic_resources (id, comic_id, comic_source_id, resource_type, display_label, resource_url, redacted_resource) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        resourceId,
        comicId,
        sourceId,
        "magnet",
        mangaName,
        "magnet:?xt=urn:btih:fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedec",
        "magnet:?xt=urn:btih:...",
      );

    await saveRuntimeSettings({
      cacheDirectory: path.join(workspace, "cache"),
      openlistBaseUrl: "http://127.0.0.1:5244",
      openlistEnabled: true,
      openlistToken: "secret-openlist-token",
    });

    await createDownloadTask({ comicResourceId: resourceId, provider: "openlist" });
    const tasks = await listDownloadTasks(20);
    const offline = tasks.find((task) => task.taskType === "offline");
    expect(offline?.status).toBe("failed");
    expect(offline?.errorMessage).toContain("10008");
    expect(offline?.errorMessage).toContain(root);
    expect(offline?.errorMessage).toContain("重试");
    expect(tasks.filter((task) => task.taskType === "transfer")).toHaveLength(0);
  });
});
