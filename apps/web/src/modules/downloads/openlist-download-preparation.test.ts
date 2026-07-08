import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ARCHIVE_FIXTURE_BASE64 =
  "UEsDBBQAAAAIADGf4lxruW0fGAAAABYAAAAHAAAAMDAxLmpwZ0tLzE5VSCxKzsgsS1XIzE1MT1Uw5OUCAFBLAwQUAAAACAAxn+JcMgcrHRgAAAAWAAAABwAAADAwMi5wbmdLS8xOVUgsSs7ILEtVyMxNTE9VMOLlAgBQSwECFAAUAAAACAAxn+Jca7ltHxgAAAAWAAAABwAAAAAAAAAAAAAAAAAAAAAAMDAxLmpwZ1BLAQIUABQAAAAIADGf4lwyBysdGAAAABYAAAAHAAAAAAAAAAAAAAAAAD0AAAAwMDIucG5nUEsFBgAAAAACAAIAagAAAHoAAAAAAA==";

describe("OpenList download preparations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MANGATEST_DB_PATH;
  });

  it("persists a ready preparation and downloads the file to a safe temporary path", async () => {
    const requests: Array<{ authorization: string | null; body: Record<string, unknown>; method: string; url: string }> = [];
    const archiveFixture = Buffer.from(ARCHIVE_FIXTURE_BASE64, "base64");
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input).startsWith("https://private.example/")) {
        requests.push({
          authorization: new Headers(init?.headers).get("Authorization"),
          body: {},
          method: init?.method ?? "GET",
          url: String(input),
        });

        return new Response(archiveFixture, {
          headers: {
            "content-length": String(archiveFixture.length),
            "content-type": "application/x-cbz",
          },
        });
      }

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
    const row = selectPreparation(sqlite, task.id);
    const transferRow = selectTransfer(sqlite, task.id);
    const tempFilePath = String(transferRow?.temp_file_path ?? "");
    const tempFileContent = await readFile(tempFilePath);
    const finalizeTick = await runDownloadWorkerTick();
    const tasks = await listDownloadTasks();
    const finalizationRow = selectFinalization(sqlite, task.id);
    const finalPath = String(finalizationRow?.final_path ?? "");
    const finalFileStat = await stat(finalPath);

    expect(tick.executed).toBe(true);
    expect(tick.reason).toBe("OpenList 文件已下载到本地临时文件，等待下一次 worker 入库扫描。");
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
    expect(tick.transfer).toMatchObject({
      bytesWritten: archiveFixture.length,
      contentType: "application/x-cbz",
      downloadTaskId: task.id,
      fileName: "Comic.cbz",
      provider: "openlist",
      sizeBytes: 1048576,
      status: "completed",
    });
    expect(finalizeTick.executed).toBe(true);
    expect(finalizeTick.reason).toBe("下载临时文件已移动到入库目录，并已触发漫画库扫描。");
    expect(finalizeTick.finalization).toMatchObject({
      downloadTaskId: task.id,
      provider: "openlist",
      status: "completed",
    });
    expect(tasks[0]?.preparation?.status).toBe("ready");
    expect(tasks[0]?.status).toBe("completed");
    expect(tasks[0]?.transfer?.status).toBe("completed");
    expect(tasks[0]?.finalization?.status).toBe("completed");
    expect(row).toMatchObject({
      download_task_id: task.id,
      provider: "openlist",
      raw_url_available: 1,
      remote_name: "Comic.cbz",
      remote_path: "/Library/Comic.cbz",
      status: "ready",
    });
    expect(transferRow).toMatchObject({
      bytes_written: archiveFixture.length,
      content_type: "application/x-cbz",
      download_task_id: task.id,
      file_name: "Comic.cbz",
      provider: "openlist",
      status: "completed",
    });
    expect(finalizationRow).toMatchObject({
      download_task_id: task.id,
      provider: "openlist",
      status: "completed",
    });
    expect(tempFilePath).toContain(path.join("downloads", "tmp", task.id));
    expect(tempFileContent.equals(archiveFixture)).toBe(true);
    expect(finalPath).toContain(path.join("Root", "下载入库", "OpenList Comic.cbz"));
    expect(finalFileStat.size).toBe(archiveFixture.length);
    expect(countRows(sqlite, "manga_roots", "absolute_path like '%下载入库'")).toBe(1);
    expect(countRows(sqlite, "local_files", "relative_path = 'OpenList Comic.cbz'")).toBe(1);
    expect(countRows(sqlite, "pages")).toBe(2);
    expect(requests).toHaveLength(3);
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
    expect(requests[1]?.url).toBe("http://127.0.0.1:5244/root/api/fs/get");
    expect(requests[2]?.url).toBe("https://private.example/download/Comic.cbz?sign=secret");
    expect(JSON.stringify(tick)).not.toContain("secret-openlist-token");
    expect(JSON.stringify(tick)).not.toContain("private.example");
    expect(JSON.stringify(tick)).not.toContain("sign=secret");
    expect(JSON.stringify(finalizeTick)).not.toContain("private.example");
    expect(JSON.stringify(finalizeTick)).not.toContain("sign=secret");
    expect(JSON.stringify(row)).not.toContain("private.example");
    expect(JSON.stringify(row)).not.toContain("sign=secret");
    expect(JSON.stringify(transferRow)).not.toContain("private.example");
    expect(JSON.stringify(transferRow)).not.toContain("sign=secret");
    expect(JSON.stringify(finalizationRow)).not.toContain("private.example");
    expect(JSON.stringify(finalizationRow)).not.toContain("sign=secret");
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

  it("records a failed finalization when the import manga root becomes unavailable", async () => {
    const archiveFixture = Buffer.from(ARCHIVE_FIXTURE_BASE64, "base64");
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input).startsWith("https://private.example/")) {
        return new Response(archiveFixture, {
          headers: {
            "content-length": String(archiveFixture.length),
            "content-type": "application/x-cbz",
          },
        });
      }

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

    await runDownloadWorkerTick();

    const transferRow = selectTransfer(sqlite, task.id);
    const tempFilePath = String(transferRow?.temp_file_path ?? "");
    const tempFileStat = await stat(tempFilePath);

    // Simulate the import root becoming unavailable before the finalization tick.
    sqlite.prepare("update manga_roots set is_enabled = 0").run();

    const finalizeTick = await runDownloadWorkerTick();
    const tasks = await listDownloadTasks();
    const finalizationRow = selectFinalization(sqlite, task.id);

    expect(finalizeTick.executed).toBe(false);
    expect(finalizeTick.reason).toBe("没有可用的 manga root，无法确定下载入库目录。");
    expect(finalizeTick.finalization).toMatchObject({
      downloadTaskId: task.id,
      provider: "openlist",
      status: "failed",
      finalPath: null,
      errorMessage: "没有可用的 manga root，无法确定下载入库目录。",
    });
    expect(tasks[0]?.status).toBe("failed");
    expect(tasks[0]?.finalization?.status).toBe("failed");
    expect(finalizationRow).toMatchObject({
      download_task_id: task.id,
      provider: "openlist",
      status: "failed",
      final_path: null,
      error_message: "没有可用的 manga root，无法确定下载入库目录。",
    });
    // The temporary file must remain intact when finalization fails so a later
    // retry can move it into the inbox without re-downloading.
    await expect(stat(tempFilePath)).resolves.toMatchObject({ size: tempFileStat.size });
    expect(countRows(sqlite, "local_files")).toBe(0);
    expect(countRows(sqlite, "pages")).toBe(0);

    // Retry clears the failed finalization so the next transfer can be finalized again.
    sqlite.prepare("update manga_roots set is_enabled = 1").run();
    const { retryDownloadTask } = await import("./index");
    await retryDownloadTask(task.id);

    expect(selectFinalization(sqlite, task.id)).toBeUndefined();
    expect(selectTransfer(sqlite, task.id)).toBeUndefined();
    expect(selectPreparation(sqlite, task.id)).toBeUndefined();
    expect(selectDownloadTaskStatus(sqlite, task.id)).toBe("queued");

    expect(JSON.stringify(finalizeTick)).not.toContain("private.example");
    expect(JSON.stringify(finalizeTick)).not.toContain("sign=secret");
    expect(JSON.stringify(finalizationRow)).not.toContain("private.example");
    expect(JSON.stringify(finalizationRow)).not.toContain("sign=secret");
  });

  it("marks the task failed when the temporary download request is rejected", async () => {
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0]) => {
      if (String(input).startsWith("https://private.example/")) {
        return new Response("forbidden", { status: 403 });
      }

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
    const transferRow = selectTransfer(sqlite, task.id);

    expect(tick.executed).toBe(false);
    expect(tick.reason).toBe("临时文件下载请求失败：HTTP 403");
    expect(tick.transfer).toMatchObject({
      downloadTaskId: task.id,
      errorMessage: "临时文件下载请求失败：HTTP 403",
      provider: "openlist",
      status: "failed",
      tempFilePath: null,
    });
    expect(tasks[0]?.status).toBe("failed");
    expect(tasks[0]?.errorMessage).toBe("临时文件下载请求失败：HTTP 403");
    expect(transferRow).toMatchObject({
      download_task_id: task.id,
      error_message: "临时文件下载请求失败：HTTP 403",
      status: "failed",
      temp_file_path: null,
    });
    expect(JSON.stringify(tick)).not.toContain("private.example");
    expect(JSON.stringify(tick)).not.toContain("sign=secret");
    expect(JSON.stringify(transferRow)).not.toContain("private.example");
    expect(JSON.stringify(transferRow)).not.toContain("sign=secret");
  });
});

async function seedOpenListTask(resourcePath: string) {
  const workspace = path.join(os.tmpdir(), `mangatest-openlist-prep-${randomUUID()}`);
  const dbPath = path.join(workspace, "test.sqlite");
  const comicId = randomUUID();
  const mangaRootId = randomUUID();
  const rootPath = path.join(workspace, "Root");
  const sourceId = randomUUID();
  const resourceId = randomUUID();

  await mkdir(workspace, { recursive: true });
  await mkdir(rootPath, { recursive: true });
  process.env.MANGATEST_DB_PATH = dbPath;

  const { bootstrapDatabase, getSqlite } = await import("../core/db");
  const { saveRuntimeSettings } = await import("../core/settings");
  const { createDownloadTask } = await import("./index");

  bootstrapDatabase();
  const sqlite = getSqlite();
  sqlite
    .prepare("insert into manga_roots (id, absolute_path, display_name, scan_mode, is_enabled) values (?, ?, ?, ?, ?)")
    .run(mangaRootId, rootPath, "Root", "children_as_comics", 1);
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
    cacheDirectory: path.join(workspace, "cache"),
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

function selectTransfer(sqlite: Database.Database, taskId: string) {
  return sqlite.prepare("select * from download_task_transfers where download_task_id = ?").get(taskId) as Record<string, unknown> | undefined;
}

function selectFinalization(sqlite: Database.Database, taskId: string) {
  return sqlite.prepare("select * from download_task_finalizations where download_task_id = ?").get(taskId) as Record<string, unknown> | undefined;
}

function selectDownloadTaskStatus(sqlite: Database.Database, taskId: string) {
  const row = sqlite.prepare("select status from download_tasks where id = ?").get(taskId) as { status: string } | undefined;
  return row?.status;
}

function countRows(sqlite: Database.Database, tableName: string, whereClause?: string) {
  const row = sqlite.prepare(`select count(*) as count from ${tableName}${whereClause ? ` where ${whereClause}` : ""}`).get() as { count: number };
  return row.count;
}
