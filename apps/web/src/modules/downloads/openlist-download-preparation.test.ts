import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("OpenList download preparations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MANGATEST_DB_PATH;
  });

  it("persists a ready file preparation without storing private download links", async () => {
    const requests: Array<{ authorization: string | null; body: Record<string, unknown>; method: string; url: string }> = [];
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
          is_dir: false,
          modified: "2026-01-01T00:00:00Z",
          name: "Comic.cbz",
          provider: "Local",
          raw_url: "https://private.example/download/Comic.cbz?sign=secret",
          size: 1048576,
          type: 4,
        },
        message: "success",
      });
    });

    const { sqlite, task } = await seedOpenListTask("/Library/Comic.cbz");
    const { listDownloadTasks, runDownloadWorkerTick } = await import("./index");

    const tick = await runDownloadWorkerTick();
    const tasks = await listDownloadTasks();
    const row = selectPreparation(sqlite, task.id);

    expect(tick.executed).toBe(false);
    expect(tick.reason).toBe("OpenList 下载链接准备已记录，真实下载执行尚未接入。");
    expect(tick.plan.task?.preparation).toMatchObject({
      downloadTaskId: task.id,
      provider: "openlist",
      rawUrlAvailable: true,
      remoteName: "Comic.cbz",
      remotePath: "/Library/Comic.cbz",
      remoteProvider: "Local",
      sizeBytes: 1048576,
      status: "ready",
    });
    expect(tasks[0]?.preparation?.status).toBe("ready");
    expect(row).toMatchObject({
      download_task_id: task.id,
      provider: "openlist",
      raw_url_available: 1,
      remote_name: "Comic.cbz",
      remote_path: "/Library/Comic.cbz",
      status: "ready",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      authorization: "secret-openlist-token",
      body: {
        page: 1,
        password: "",
        path: "/Library/Comic.cbz",
        per_page: 0,
        refresh: false,
      },
      method: "POST",
      url: "http://127.0.0.1:5244/root/api/fs/get",
    });
    expect(JSON.stringify(tick)).not.toContain("secret-openlist-token");
    expect(JSON.stringify(tick)).not.toContain("private.example");
    expect(JSON.stringify(tick)).not.toContain("sign=secret");
    expect(JSON.stringify(row)).not.toContain("private.example");
    expect(JSON.stringify(row)).not.toContain("sign=secret");
  });

  it("records a blocked preparation for directories without executing downloads", async () => {
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0]) => {
      if (String(input).endsWith("/api/fs/list")) {
        return Response.json({
          code: 200,
          data: {
            content: [{ is_dir: false, name: "Chapter.cbz", provider: "Local", raw_url: "https://private.example/Chapter.cbz?sign=secret", size: 1024, type: 4 }],
            has_more: false,
            page: 1,
            per_page: 10,
            provider: "Local",
            total: 1,
          },
          message: "success",
        });
      }

      return Response.json({
        code: 200,
        data: {
          is_dir: true,
          modified: "2026-01-01T00:00:00Z",
          name: "Library",
          provider: "Local",
          raw_url: "",
          size: 0,
          type: 1,
        },
        message: "success",
      });
    });

    const { sqlite, task } = await seedOpenListTask("/Library");
    const { runDownloadWorkerTick } = await import("./index");

    const tick = await runDownloadWorkerTick();
    const row = selectPreparation(sqlite, task.id);

    expect(tick.executed).toBe(false);
    expect(tick.plan.task?.preparation).toMatchObject({
      downloadTaskId: task.id,
      provider: "openlist",
      rawUrlAvailable: false,
      remoteName: "Library",
      remotePath: "/Library",
      status: "blocked",
    });
    expect(row).toMatchObject({
      download_task_id: task.id,
      error_message: "OpenList 路径是目录：Library，已列举 1 个预览项。后续需要进入云端目录扫描流程。",
      raw_url_available: 0,
      remote_name: "Library",
      remote_path: "/Library",
      status: "blocked",
    });
    expect(JSON.stringify(tick)).not.toContain("private.example");
    expect(JSON.stringify(row)).not.toContain("private.example");
    expect(selectDownloadTaskStatus(sqlite, task.id)).toBe("queued");
  });
});

async function seedOpenListTask(resourcePath: string) {
  const workspace = path.join(os.tmpdir(), `mangatest-openlist-prep-${randomUUID()}`);
  const dbPath = path.join(workspace, "test.sqlite");
  const comicId = randomUUID();
  const sourceId = randomUUID();
  const resourceId = randomUUID();

  await mkdir(workspace, { recursive: true });
  process.env.MANGATEST_DB_PATH = dbPath;

  const { bootstrapDatabase, getSqlite } = await import("../core/db");
  const { saveRuntimeSettings } = await import("../core/settings");
  const { createDownloadTask } = await import("./index");

  bootstrapDatabase();
  const sqlite = getSqlite();
  sqlite
    .prepare("insert into comics (id, display_title, file_title, sort_title, status) values (?, ?, ?, ?, ?)")
    .run(comicId, "OpenList Comic", "OpenList Comic", "openlist comic", "remote_only");
  sqlite
    .prepare("insert into comic_sources (id, comic_id, site, source_url, original_title) values (?, ?, ?, ?, ?)")
    .run(sourceId, comicId, "openlist", "https://example.test/openlist-comic", "OpenList Comic");
  sqlite
    .prepare("insert into comic_resources (id, comic_id, comic_source_id, resource_type, display_label, resource_url, redacted_resource) values (?, ?, ?, ?, ?, ?, ?)")
    .run(resourceId, comicId, sourceId, "openlist", "OpenList 文件", resourcePath, "openlist:/.../Comic.cbz");

  await saveRuntimeSettings({
    openlistBaseUrl: "http://127.0.0.1:5244/root",
    openlistEnabled: true,
    openlistToken: "secret-openlist-token",
  });

  const task = await createDownloadTask({ comicResourceId: resourceId });

  return { sqlite, task: task.task };
}

function selectPreparation(sqlite: Database.Database, taskId: string) {
  return sqlite.prepare("select * from download_task_preparations where download_task_id = ?").get(taskId) as Record<string, unknown> | undefined;
}

function selectDownloadTaskStatus(sqlite: Database.Database, taskId: string) {
  const row = sqlite.prepare("select status from download_tasks where id = ?").get(taskId) as { status: string } | undefined;
  return row?.status;
}
