import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { createVideoDownloadTaskMock } = vi.hoisted(() => ({
  createVideoDownloadTaskMock: vi.fn(),
}));

vi.mock("@/modules/downloads", () => ({
  createVideoDownloadTask: createVideoDownloadTaskMock,
}));

describe("video metadata ingest", () => {
  beforeEach(() => {
    vi.resetModules();
    createVideoDownloadTaskMock.mockReset();
    createVideoDownloadTaskMock.mockImplementation(async (input: { title: string; resourceUrl: string; targetDirectory?: string | null }) => ({
      created: true,
      task: {
        id: randomUUID(),
        title: input.title,
        resourceUrl: input.resourceUrl,
        provider: "aria2",
        status: "queued",
        targetDirectory: input.targetDirectory ?? null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
  });

  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
  });

  it("normalizes official download-page resources and keeps the highest quality first", async () => {
    const { normalizeVideoIngestPayload } = await import("./video-import");
    const result = normalizeVideoIngestPayload({
      site: "Hanime1.me",
      sourceUrl: "https://hanime1.me/watch?v=407861",
      sourceId: "hanime1.me/watch?v=407861",
      title: "[Artist] Sample Video",
      video: {
        durationSeconds: 65.9,
        sources: [
          { type: "http", url: "https://vdownload.hembed.com/407861-720p.mp4?secure=fixture", label: "720p", quality: 720 },
          { type: "http", url: "https://vdownload.hembed.com/407861-1080p.mp4?secure=fixture", label: "1080p", quality: 1080 },
        ],
      },
      resources: [{ type: "http", url: "https://vdownload.hembed.com/407861-720p.mp4?secure=fixture", label: "720p" }],
    });

    expect(result.site).toBe("hanime1.me");
    expect(result.durationSeconds).toBe(65);
    expect(result.resources).toHaveLength(2);
    expect(result.resources[0]).toMatchObject({ label: "1080p", quality: 1080 });
  });

  it("rejects payloads without a download-page resource", async () => {
    const { normalizeVideoIngestPayload } = await import("./video-import");
    expect(() => normalizeVideoIngestPayload({
      site: "hanime1.me",
      sourceUrl: "https://hanime1.me/watch?v=407861",
      title: "Sample Video",
      video: { sources: [] },
    })).toThrow("没有可用的视频下载地址");
  });

  it("creates tags and reuses the same placeholder and staging directory for a repeated source", async () => {
    const dbPath = path.join(os.tmpdir(), `mangatest-video-import-${randomUUID()}.sqlite`);
    process.env.MANGATEST_DB_PATH = dbPath;

    const { bootstrapDatabase, getDb, tags, videoRoots, videoSources, videoTags, videos } = await import("../core/db");
    const { saveRuntimeSettings } = await import("../core/settings");
    const { importVideoPayload } = await import("./video-import");
    bootstrapDatabase();

    const rootId = randomUUID();
    const rootPath = path.join(os.tmpdir(), `mangatest-video-root-${randomUUID()}`);
    getDb().insert(videoRoots).values({
      id: rootId,
      absolutePath: rootPath,
      displayName: "Video Root",
      isEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
    await saveRuntimeSettings({ aria2Enabled: true, aria2RpcUrl: "http://127.0.0.1:6800/jsonrpc" });

    const first = await importVideoPayload({
      videoRootId: rootId,
      site: "Hanime1.me",
      sourceId: "hanime1.me/watch?v=407861",
      sourceUrl: "https://hanime1.me/watch?v=407861",
      title: "[Artist] Sample Video",
      tags: [{ namespace: "general", name: "Sample Tag" }],
      video: { sources: [{ type: "http", url: "https://vdownload.hembed.com/407861-1080p.mp4?secure=fixture", quality: 1080 }] },
    });
    const firstTaskInput = createVideoDownloadTaskMock.mock.calls[0]?.[0];

    const second = await importVideoPayload({
      videoRootId: rootId,
      site: "Hanime1.me",
      sourceId: "hanime1.me/watch?v=407861",
      sourceUrl: "https://hanime1.me/watch?v=407861&ref=updated",
      title: "[Artist] Updated Video Title",
      tags: [{ namespace: "general", name: "Sample Tag" }],
      video: { sources: [{ type: "http", url: "https://vdownload.hembed.com/407861-1080p.mp4?secure=fixture", quality: 1080 }] },
    });
    const secondTaskInput = createVideoDownloadTaskMock.mock.calls[1]?.[0];

    const db = getDb();
    const videoRows = db.select().from(videos).all();
    const sourceRows = db.select().from(videoSources).all();
    const tag = db.select().from(tags).where(eq(tags.canonical, "general:sample tag")).get();
    const tagAssignments = tag ? db.select().from(videoTags).where(and(eq(videoTags.videoId, first.videoId), eq(videoTags.tagId, tag.id))).all() : [];

    expect(second.videoId).toBe(first.videoId);
    expect(second.sourceRecordId).toBe(first.sourceRecordId);
    expect(second.createdVideo).toBe(false);
    expect(videoRows).toHaveLength(1);
    expect(sourceRows).toHaveLength(1);
    expect(tagAssignments).toHaveLength(1);
    expect(secondTaskInput?.targetDirectory).toBe(firstTaskInput?.targetDirectory);
    expect(secondTaskInput?.targetDirectory).toBe(path.join(rootPath, "[Artist] Sample Video"));
    expect(secondTaskInput?.targetDirectory).not.toContain("下载入库");
  });

  it("requires an enabled video root", async () => {
    process.env.MANGATEST_DB_PATH = path.join(os.tmpdir(), `mangatest-video-import-no-root-${randomUUID()}.sqlite`);
    const { importVideoPayload } = await import("./video-import");

    await expect(importVideoPayload({
      site: "hanime1.me",
      sourceUrl: "https://hanime1.me/watch?v=407861",
      title: "Sample Video",
      video: { sources: [{ type: "http", url: "https://vdownload.hembed.com/407861-1080p.mp4" }] },
    })).rejects.toThrow("没有可用的视频根目录");
  });
});
