import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("VideoMergeRepository", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    vi.resetModules();
  });

  it("merges a single video as an episode, restores it, and preserves ownership after rescanning", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-video-merge-${randomUUID()}`);
    const rootPath = path.join(workspace, "videos");
    await mkdir(rootPath, { recursive: true });
    await writeFile(path.join(rootPath, "source.mp4"), "source");
    await writeFile(path.join(rootPath, "target.mp4"), "target");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    const { bootstrapDatabase, getDb, tags, videoRoots, videoTags } = await import("../core/db");
    bootstrapDatabase();
    const rootId = randomUUID();
    const now = new Date().toISOString();
    getDb().insert(videoRoots).values({
      id: rootId,
      absolutePath: rootPath,
      displayName: "Test videos",
      scanMode: "children_as_videos",
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    }).run();

    const { scanVideoRoot } = await import("./scan-video-root");
    await scanVideoRoot(rootId);
    const { createVideoRepository } = await import("./videos.repository");
    const { createVideoMergeRepository } = await import("./video-merge.repository");
    const repository = createVideoRepository();
    const mergeRepository = createVideoMergeRepository();
    const initialRows = await repository.listAdminRows();
    const source = initialRows.find((row) => row.displayTitle === "source");
    const target = initialRows.find((row) => row.displayTitle === "target");

    expect(source).toMatchObject({ episodeCount: 1, status: "readable", parentVideoId: null, mergedAsEpisodeId: null });
    expect(target).toMatchObject({ episodeCount: 1 });
    if (!source || !target) throw new Error("test videos were not scanned");

    const authorTagId = randomUUID();
    const groupTagId = randomUUID();
    getDb().insert(tags).values([
      { id: authorTagId, namespace: "artist", name: "alice", canonical: "artist:alice", displayNameZh: "爱丽丝" },
      { id: groupTagId, namespace: "group", name: "circle", canonical: "group:circle" },
    ]).run();
    getDb().insert(videoTags).values([
      { videoId: source.id, tagId: authorTagId, source: "metadata" },
      { videoId: source.id, tagId: groupTagId, source: "metadata" },
    ]).run();
    expect((await repository.listAdminRows()).find((row) => row.id === source.id)?.authorNames).toEqual(["爱丽丝", "circle"]);
    expect((await repository.getDetail(source.id))?.authorNames).toEqual(["爱丽丝", "circle"]);

    const targetEpisode = (await repository.getDetail(target.id))?.episodes[0];
    if (!targetEpisode) throw new Error("target episode was not scanned");
    await repository.updateEpisodeTitle(target.id, targetEpisode.id, "Edited target episode");
    expect((await repository.getDetail(target.id))?.episodes[0]).toMatchObject({ title: "Edited target episode" });

    const merge = await mergeRepository.mergeAsEpisode(source.id, target.id);
    expect(merge).toMatchObject({ sourceVideoId: source.id, targetVideoId: target.id, physicalFilesTouched: false });
    expect((await repository.getDetail(target.id))?.episodes).toHaveLength(2);
    expect(await repository.getDetail(source.id)).toMatchObject({ parentVideoId: target.id, mergedAsEpisodeId: merge.episodeId, episodes: [] });

    await scanVideoRoot(rootId);
    expect((await repository.getDetail(target.id))?.episodes).toHaveLength(2);
    expect(await repository.getDetail(source.id)).toMatchObject({ status: "hidden", parentVideoId: target.id, episodes: [] });

    await mergeRepository.restoreMergedVideo(source.id);
    expect(await repository.getDetail(source.id)).toMatchObject({ status: "readable", parentVideoId: null, mergedAsEpisodeId: null, episodes: [{ id: merge.episodeId }] });
    expect((await repository.getDetail(target.id))?.episodes).toHaveLength(1);
  });

  it("merges multiple single-episode videos and removes one without touching files", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-video-merge-batch-${randomUUID()}`);
    const rootPath = path.join(workspace, "videos");
    await mkdir(rootPath, { recursive: true });
    await writeFile(path.join(rootPath, "source-a.mp4"), "source-a");
    await writeFile(path.join(rootPath, "source-b.mp4"), "source-b");
    await writeFile(path.join(rootPath, "target.mp4"), "target");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    const { bootstrapDatabase, getDb, videoRoots } = await import("../core/db");
    bootstrapDatabase();
    const rootId = randomUUID();
    const now = new Date().toISOString();
    getDb().insert(videoRoots).values({ id: rootId, absolutePath: rootPath, displayName: "Test videos", scanMode: "children_as_videos", isEnabled: true, createdAt: now, updatedAt: now }).run();
    const { scanVideoRoot } = await import("./scan-video-root");
    await scanVideoRoot(rootId);

    const { createVideoRepository } = await import("./videos.repository");
    const { createVideoMergeRepository } = await import("./video-merge.repository");
    const repository = createVideoRepository();
    const mergeRepository = createVideoMergeRepository();
    const rows = await repository.listAdminRows();
    const sourceA = rows.find((row) => row.displayTitle === "source-a");
    const sourceB = rows.find((row) => row.displayTitle === "source-b");
    const target = rows.find((row) => row.displayTitle === "target");
    if (!sourceA || !sourceB || !target) throw new Error("test videos were not scanned");

    const merges = await mergeRepository.mergeAsEpisodes([sourceA.id, sourceB.id], target.id);
    expect(merges).toHaveLength(2);
    expect((await repository.getDetail(target.id))?.episodes).toHaveLength(3);
    expect((await repository.getDetail(target.id))?.episodes.filter((episode) => episode.mergedFromVideoId)).toHaveLength(2);

    await mergeRepository.removeMergedEpisode(target.id, merges[0]!.episodeId);
    expect((await repository.getDetail(target.id))?.episodes).toHaveLength(2);
    expect(await repository.getDetail(sourceA.id)).toMatchObject({ status: "readable", parentVideoId: null, mergedAsEpisodeId: null, episodes: [{ id: merges[0]!.episodeId }] });
  });

  it("rejects a video that already contains multiple episodes", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-video-merge-multi-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    const { bootstrapDatabase, getDb, videoEpisodes, videoRoots, videos } = await import("../core/db");
    bootstrapDatabase();
    const now = new Date().toISOString();
    const rootId = randomUUID();
    const sourceId = randomUUID();
    const targetId = randomUUID();
    getDb().insert(videoRoots).values({ id: rootId, absolutePath: workspace, displayName: "Test", scanMode: "children_as_videos", isEnabled: true, createdAt: now, updatedAt: now }).run();
    getDb().insert(videos).values([
      { id: sourceId, videoRootId: rootId, sourceKey: "dir:source", displayTitle: "Source", fileTitle: "Source", sortTitle: "source", status: "readable", createdAt: now, updatedAt: now },
      { id: targetId, videoRootId: rootId, sourceKey: "file:target.mp4", displayTitle: "Target", fileTitle: "Target", sortTitle: "target", status: "readable", createdAt: now, updatedAt: now },
    ]).run();
    getDb().insert(videoEpisodes).values([
      { id: randomUUID(), videoId: sourceId, videoRootId: rootId, title: "One", sortTitle: "one", absolutePath: path.join(workspace, "one.mp4"), relativePath: "one.mp4", extension: "mp4", kind: "file", sortOrder: 0, createdAt: now, updatedAt: now },
      { id: randomUUID(), videoId: sourceId, videoRootId: rootId, title: "Two", sortTitle: "two", absolutePath: path.join(workspace, "two.mp4"), relativePath: "two.mp4", extension: "mp4", kind: "file", sortOrder: 1, createdAt: now, updatedAt: now },
    ]).run();

    const { createVideoMergeRepository } = await import("./video-merge.repository");
    await expect(createVideoMergeRepository().mergeAsEpisode(sourceId, targetId)).rejects.toThrow("仅支持把单集可读视频");
  });

  it("adds merge columns when bootstrapping a pre-merge video table", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-video-merge-migration-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    await mkdir(workspace, { recursive: true });
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE videos (
        id TEXT PRIMARY KEY NOT NULL,
        video_root_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        display_title TEXT NOT NULL,
        file_title TEXT NOT NULL,
        sort_title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'readable',
        last_watched_episode_id TEXT,
        last_watched_position_seconds INTEGER,
        last_watched_at TEXT,
        hidden_at TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX videos_status_idx ON videos (status);
      CREATE INDEX videos_sort_title_idx ON videos (sort_title);
      CREATE UNIQUE INDEX videos_root_source_idx ON videos (video_root_id, source_key);
    `);
    legacy.close();
    process.env.MANGATEST_DB_PATH = dbPath;

    const { bootstrapDatabase, getSqlite } = await import("../core/db");
    bootstrapDatabase();
    const columns = (getSqlite().prepare("PRAGMA table_info(videos)").all() as Array<{ name: string }>).map((column) => column.name);
    expect(columns).toContain("parent_video_id");
    expect(columns).toContain("merged_as_episode_id");
    expect(getSqlite().prepare("SELECT parent_video_id, merged_as_episode_id FROM videos").get()).toBeUndefined();
  });
});
