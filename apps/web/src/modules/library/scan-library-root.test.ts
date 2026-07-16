import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("scanMangaRoot", () => {
  it("does not import the download staging folder 下载入库 as a comic", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-scan-import-skip-${randomUUID()}`);
    const rootPath = path.join(workspace, "Root");
    const stagingPath = path.join(rootPath, "下载入库");
    const comicPath = path.join(rootPath, "Real Comic");
    const dbPath = path.join(workspace, "test.sqlite");
    const jpegFixture = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#ef3b91" },
    })
      .jpeg()
      .toBuffer();

    await mkdir(comicPath, { recursive: true });
    await mkdir(stagingPath, { recursive: true });
    await writeFile(path.join(comicPath, "001.jpg"), jpegFixture);
    await writeFile(path.join(stagingPath, "should-not-be-comic-title.txt"), "staging");

    process.env.MANGATEST_DB_PATH = dbPath;
    const { createAndScanMangaRoot } = await import("./create-and-scan-manga-root");
    const result = await createAndScanMangaRoot({
      absolutePath: rootPath,
      displayName: "Skip staging",
    });

    expect(result.scanError).toBeNull();
    expect(result.scanResult?.addedCount).toBe(1);

    const sqlite = new Database(dbPath);
    const titles = sqlite.prepare("select file_title as t from comics").all() as Array<{ t: string }>;
    expect(titles.map((row) => row.t)).toEqual(["Real Comic"]);
    expect(titles.some((row) => row.t === "下载入库")).toBe(false);
    sqlite.close();
  });

  it("imports directory and cbz comics, then marks missing local files on rescan", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-scan-${randomUUID()}`);
    const rootPath = path.join(workspace, "Root");
    const directoryComicPath = path.join(rootPath, "Comic A");
    const dbPath = path.join(workspace, "test.sqlite");
    const jpegFixture = await sharp({
      create: {
        width: 16,
        height: 24,
        channels: 3,
        background: "#ef3b91",
      },
    })
      .jpeg()
      .toBuffer();
    const pngFixture = await sharp({
      create: {
        width: 12,
        height: 18,
        channels: 3,
        background: "#ffffff",
      },
    })
      .png()
      .toBuffer();

    await mkdir(workspace, { recursive: true });
    await mkdir(directoryComicPath, { recursive: true });
    await writeFile(path.join(directoryComicPath, "001.jpg"), jpegFixture);
    await writeFile(path.join(directoryComicPath, "002.png"), pngFixture);
    await writeFile(
      path.join(rootPath, "Archive Comic.cbz"),
      createStoredZip([
        { name: "001.jpg", data: jpegFixture },
        { name: "002.png", data: pngFixture },
      ]),
    );

    process.env.MANGATEST_DB_PATH = dbPath;

    const { createAndScanMangaRoot } = await import("./create-and-scan-manga-root");
    const { scanMangaRoot } = await import("./scan-library-root");

    const autoScan = await createAndScanMangaRoot({
      absolutePath: rootPath,
      displayName: "Smoke root",
    });

    const root = autoScan.root;
    const firstScan = autoScan.scanResult;

    expect(autoScan.scanError).toBeNull();
    expect(firstScan).not.toBeNull();
    expect(firstScan?.addedCount).toBe(2);
    expect(firstScan?.pageCount).toBe(4);

    const sqlite = new Database(dbPath);
    expect(countRows(sqlite, "comics")).toBe(2);
    expect(countRows(sqlite, "local_files")).toBe(2);
    expect(countRows(sqlite, "chapters")).toBe(2);
    expect(countRows(sqlite, "pages")).toBe(4);
    expect(countRows(sqlite, "cache_entries", "kind = 'archive_file_list'")).toBe(1);
    expect(tableExists(sqlite, "settings")).toBe(true);
    expect(tableExists(sqlite, "reading_progress")).toBe(true);
    expect(tableExists(sqlite, "media_assets")).toBe(true);
    expect(tableExists(sqlite, "cache_entries")).toBe(true);
    expect(tableExists(sqlite, "operation_logs")).toBe(true);

    const { readReaderPageImage } = await import("../reader/page-images");
    const directoryPage = selectPageBySourceKind(sqlite, "filesystem");
    const secondDirectoryPage = selectPageBySourceKind(sqlite, "filesystem", 1);
    const archivePage = selectPageBySourceKind(sqlite, "archive");
    const directoryImage = await readReaderPageImage(directoryPage.id);
    const archiveImage = await readReaderPageImage(archivePage.id);

    expect(directoryImage?.contentType).toBe("image/jpeg");
    expect(directoryImage?.data.length).toBe(jpegFixture.length);
    expect(archiveImage?.contentType).toBe("image/jpeg");
    expect(archiveImage?.data.length).toBeGreaterThan(0);

    // Scans persist page image dimensions so the reader can reserve the right
    // placeholder height before the image loads.
    const directoryPageRow = selectPageDimensions(sqlite, directoryPage.id);
    const secondDirectoryPageRow = selectPageDimensions(sqlite, secondDirectoryPage.id);
    const archivePageRow = selectPageDimensions(sqlite, archivePage.id);
    expect(directoryPageRow).toMatchObject({ width: 16, height: 24 });
    expect(secondDirectoryPageRow).toMatchObject({ width: 12, height: 18 });
    expect(archivePageRow).toMatchObject({ width: 16, height: 24 });

    const { getRuntimeSettings, saveRuntimeSettings } = await import("../core/settings");
    const savedSettings = await saveRuntimeSettings({
      cacheDirectory: path.join(workspace, "cache"),
      cacheSizeMb: 1,
      readerImmersiveDefault: true,
      readerPreloadAheadPages: 4,
      readerPreloadEnabled: false,
      readerThumbnailSidebarDefault: false,
      readerThumbnailTtlDays: 7,
      themeMode: "dark",
      metadataImportToken: "test-import-token",
      downloadDefaultTargetDirectory: path.join(workspace, "downloads"),
      openlistEnabled: true,
      openlistBaseUrl: "http://127.0.0.1:5244/",
      openlistToken: "test-openlist-token",
    });
    const runtimeSettings = await getRuntimeSettings();

    expect(savedSettings.cacheDirectory).toBe(path.join(workspace, "cache"));
    expect(runtimeSettings.cacheSizeMb).toBe(1);
    expect(runtimeSettings.readerImmersiveDefault).toBe(true);
    expect(runtimeSettings.readerPreloadAheadPages).toBe(4);
    expect(runtimeSettings.readerPreloadEnabled).toBe(false);
    expect(runtimeSettings.readerThumbnailSidebarDefault).toBe(false);
    expect(runtimeSettings.readerThumbnailTtlDays).toBe(7);
    expect(savedSettings.themeMode).toBe("light");
    expect(runtimeSettings.themeMode).toBe("light");
    expect(runtimeSettings.metadataImportToken).toBe("test-import-token");
    expect(runtimeSettings.downloadDefaultTargetDirectory).toBe(path.join(workspace, "downloads"));
    expect(runtimeSettings.openlistEnabled).toBe(true);
    expect(runtimeSettings.openlistBaseUrl).toBe("http://127.0.0.1:5244/");
    expect(runtimeSettings.openlistToken).toBe("test-openlist-token");

    const comicAId = selectComicIdByFileTitle(sqlite, "Comic A");
    const { getComicCover, getReaderThumbnail, regenerateComicCover, uploadComicCover } = await import("../media-assets");
    const generatedCover = await getComicCover({ comicId: comicAId, use: "list_thumbnail", width: 120, height: 180 });
    const cachedCover = await getComicCover({ comicId: comicAId, use: "list_thumbnail", width: 120, height: 180 });
    const generatedThumbnail = await getReaderThumbnail({ pageId: directoryPage.id, width: 88, height: 132 });
    const cachedThumbnail = await getReaderThumbnail({ pageId: directoryPage.id, width: 88, height: 132 });

    expect(generatedCover?.contentType).toBe("image/webp");
    expect(generatedCover?.cacheStatus).toBe("generated");
    expect(cachedCover?.cacheStatus).toBe("hit");
    expect(generatedThumbnail?.contentType).toBe("image/webp");
    expect(generatedThumbnail?.cacheStatus).toBe("generated");
    expect(cachedThumbnail?.cacheStatus).toBe("hit");
    expect(countRows(sqlite, "media_assets")).toBe(2);

    const regeneratedCover = await regenerateComicCover({ comicId: comicAId });

    expect(regeneratedCover.mangaFilesTouched).toBe(false);
    expect(regeneratedCover.removedCacheCount).toBe(1);
    expect(regeneratedCover.generatedCount).toBe(2);
    expect(regeneratedCover.assets.map((asset) => asset.use).sort()).toEqual(["cover", "list_thumbnail"]);
    expect(countRows(sqlite, "media_assets")).toBe(3);

    const uploadedCover = await uploadComicCover({ comicId: comicAId, data: pngFixture });
    const manualListCover = await getComicCover({ comicId: comicAId, use: "list_thumbnail" });
    const regeneratedAutomaticCover = await regenerateComicCover({ comicId: comicAId });
    const manualListCoverAfterRegenerate = await getComicCover({ comicId: comicAId, use: "list_thumbnail" });

    expect(uploadedCover.mangaFilesTouched).toBe(false);
    expect(uploadedCover.generatedCount).toBe(2);
    expect(uploadedCover.removedManualCoverCount).toBe(0);
    expect(manualListCover?.cacheStatus).toBe("hit");
    expect(regeneratedAutomaticCover.removedCacheCount).toBe(2);
    expect(manualListCoverAfterRegenerate?.cacheStatus).toBe("hit");
    expect(countRows(sqlite, "media_assets")).toBe(5);

    const { cleanupApplicationCache, getCacheSummary } = await import("../core/cache");
    const cacheSummary = await getCacheSummary();

    expect(cacheSummary.mediaAssetCount).toBe(5);
    expect(cacheSummary.archiveFileListCount).toBe(1);
    expect(cacheSummary.maxSizeBytes).toBe(1024 * 1024);
    expect(cacheSummary.totalSizeBytes).toBeGreaterThan(0);

    sqlite
      .prepare(
        "insert into cache_entries (id, kind, cache_key, metadata_json, size_bytes, last_access_at, expires_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(randomUUID(), "archive_file_list", "expired:test", '{"pages":[]}', 12, "2000-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z");

    const cleanupResult = await cleanupApplicationCache();
    expect(cleanupResult.removedCount).toBeGreaterThanOrEqual(1);
    expect(countRows(sqlite, "cache_entries", "cache_key = 'expired:test'")).toBe(0);

    const { createTagRepository } = await import("../tags/tags.repository");
    const tagRepository = createTagRepository();
    const createdTag = await tagRepository.create({
      namespace: "artist",
      name: "Sample Artist",
      displayNameZh: "示例作者",
    });
    const updatedTag = await tagRepository.update(createdTag.id, {
      namespace: "artist",
      name: "Sample Artist",
      displayNameZh: "示例作者改",
    });
    const tagRows = await tagRepository.listWithCounts();

    expect(createdTag.canonical).toBe("artist:sample artist");
    expect(updatedTag?.displayNameZh).toBe("示例作者改");
    expect(tagRows.some((tag) => tag.id === createdTag.id && tag.comicCount === 0)).toBe(true);

    const { createComicTagAssignmentRepository } = await import("../tags/comic-tags.repository");
    const comicTagRepository = createComicTagAssignmentRepository();
    const assignedTags = await comicTagRepository.addToComic(comicAId, createdTag.id);
    const removedTags = await comicTagRepository.removeFromComic(comicAId, createdTag.id);
    const reassignedTags = await comicTagRepository.addToComic(comicAId, createdTag.id);

    expect(assignedTags.some((tag) => tag.id === createdTag.id && tag.source === "manual" && tag.isUserEdited)).toBe(true);
    expect(removedTags.some((tag) => tag.id === createdTag.id)).toBe(false);
    expect(reassignedTags.some((tag) => tag.id === createdTag.id)).toBe(true);

    const { createComicRepository } = await import("./comics.repository");
    const comicRepository = createComicRepository();
    const { createComicMetadataRepository } = await import("./comic-metadata.repository");
    const metadataRepository = createComicMetadataRepository();
    const updatedMetadata = await metadataRepository.updateMetadata(comicAId, {
      displayTitle: "Comic A Edited",
      metadataQueryTitle: "Comic A Search Alias",
      originalTitle: "Comic A Original",
    });
    const metadataSearchResult = await comicRepository.searchReadableCards({ query: "Search Alias", pageSize: 12 });
    const storedMetadata = selectComicMetadata(sqlite, comicAId);

    expect(updatedMetadata.displayTitle).toBe("Comic A Edited");
    expect(updatedMetadata.fileTitle).toBe("Comic A");
    expect(updatedMetadata.originalTitle).toBe("Comic A Original");
    expect(updatedMetadata.metadataQueryTitle).toBe("Comic A Search Alias");
    expect(storedMetadata.sortTitle).toBe("comic a edited");
    expect(metadataSearchResult.items.map((comic) => comic.id)).toContain(comicAId);

    const { checkMetadataSourceStatus, importMetadataPayload, validateMetadataImportToken } = await import("../metadata-ingest");

    await expect(validateMetadataImportToken("wrong-token")).rejects.toThrow("导入令牌无效");
    await expect(validateMetadataImportToken("test-import-token")).resolves.toBeUndefined();

    const metadataStatusBeforeImport = await checkMetadataSourceStatus({
      site: "examplesite",
      sourceId: "gallery-123",
      sourceUrl: "https://example.test/g/gallery-123",
    });

    expect(metadataStatusBeforeImport.imported).toBe(false);
    expect(metadataStatusBeforeImport.localReadable).toBe(false);

    const metadataImport = await importMetadataPayload({
      comicId: comicAId,
      site: "ExampleSite",
      sourceId: "gallery-123",
      sourceUrl: "https://example.test/g/gallery-123",
      title: "Remote Metadata Title",
      originalTitle: "Remote Original Title",
      coverUrl: "https://example.test/g/gallery-123/cover.jpg",
      tags: [
        { namespace: "artist", name: "Sample Artist" },
        { namespace: "group", name: "Metadata Group", displayNameZh: "元数据社团" },
      ],
      resources: [
        {
          type: "magnet",
          url: "magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12&dn=PrivateName",
          label: "磁链",
        },
      ],
    });
    const metadataAfterImport = selectComicMetadata(sqlite, comicAId);
    const metadataResource = selectComicResource(sqlite, comicAId);

    expect(metadataImport.createdComic).toBe(false);
    expect(metadataImport.matchedBy).toBe("comic_id");
    expect(metadataImport.localReadable).toBe(true);
    expect(metadataAfterImport.displayTitle).toBe("Comic A Edited");
    expect(metadataAfterImport.originalTitle).toBe("Comic A Original");
    expect(metadataAfterImport.metadataQueryTitle).toBe("Comic A Search Alias");
    expect(countRows(sqlite, "comic_sources", "site = 'examplesite'")).toBe(1);
    expect(metadataResource.resourceUrl).toContain("PrivateName");
    expect(metadataResource.resourceType).toBe("magnet");
    expect(metadataResource.redactedResource).toBe("magnet:?xt=urn:btih:ABCDEF12...");
    expect(metadataResource.redactedResource).not.toContain("PrivateName");
    expect(selectComicTagSource(sqlite, comicAId, "artist:sample artist").source).toBe("manual");
    expect(selectComicTagSource(sqlite, comicAId, "group:metadata group").source).toBe("metadata");

    const {
      cancelDownloadTask,
      createDownloadTask,
      listDownloadableResources,
      listDownloadProviderAdapters,
      listDownloadTaskEvents,
      listDownloadTasks,
      planNextDownloadDispatch,
      retryDownloadTask,
      runDownloadWorkerTick,
    } = await import("../downloads");
    const downloadableResourcesBeforeTask = await listDownloadableResources();
    const downloadableResource = downloadableResourcesBeforeTask.find((resource) => resource.id === metadataResource.id);

    expect(downloadableResource?.comicTitle).toBe("Comic A Edited");
    expect(downloadableResource?.resourceType).toBe("magnet");
    expect(downloadableResource?.defaultProvider).toBe("aria2");
    expect(downloadableResource?.compatibleProviders).toEqual(["aria2"]);
    expect(downloadableResource?.activeTaskCount).toBe(0);

    const createdDownloadTask = await createDownloadTask({ comicResourceId: metadataResource.id });
    const duplicateDownloadTask = await createDownloadTask({ comicResourceId: metadataResource.id, provider: "aria2" });
    const downloadTasks = await listDownloadTasks();
    const downloadTaskEventsAfterCreate = await listDownloadTaskEvents();
    const providerAdapters = listDownloadProviderAdapters();
    const dispatchPlanAfterCreate = await planNextDownloadDispatch();
    const workerTickAfterCreate = await runDownloadWorkerTick();
    const downloadableResourcesAfterTask = await listDownloadableResources();

    expect(createdDownloadTask.created).toBe(true);
    expect(createdDownloadTask.task.status).toBe("queued");
    expect(createdDownloadTask.task.provider).toBe("aria2");
    expect(createdDownloadTask.task.comicTitle).toBe("Comic A Edited");
    expect(createdDownloadTask.task.redactedResource).toBe("magnet:?xt=urn:btih:ABCDEF12...");
    expect(createdDownloadTask.task.targetDirectory).toBe(path.join(workspace, "downloads"));
    expect(duplicateDownloadTask.created).toBe(false);
    expect(duplicateDownloadTask.task.id).toBe(createdDownloadTask.task.id);
    expect(downloadTasks.map((task) => task.id)).toContain(createdDownloadTask.task.id);
    expect(downloadableResourcesAfterTask.find((resource) => resource.id === metadataResource.id)?.activeTaskCount).toBe(1);
    expect(countRows(sqlite, "download_tasks")).toBe(1);
    expect(countRows(sqlite, "operation_logs", "operation = 'download_task_create'")).toBe(1);
    expect(downloadTaskEventsAfterCreate).toHaveLength(1);
    expect(downloadTaskEventsAfterCreate[0]?.operation).toBe("download_task_create");
    expect(downloadTaskEventsAfterCreate[0]?.redactedResource).toBe("magnet:?xt=urn:btih:ABCDEF12...");
    expect(JSON.stringify(downloadTaskEventsAfterCreate)).not.toContain("PrivateName");
    expect(providerAdapters.map((adapter) => adapter.provider).sort()).toEqual(["aria2", "builtin-http", "openlist"]);
    expect(dispatchPlanAfterCreate.status).toBe("blocked");
    expect(dispatchPlanAfterCreate.provider).toBe("aria2");
    expect(dispatchPlanAfterCreate.task?.id).toBe(createdDownloadTask.task.id);
    expect(dispatchPlanAfterCreate.resource?.redactedResource).toBe("magnet:?xt=urn:btih:ABCDEF12...");
    expect(dispatchPlanAfterCreate.readiness?.code).toBe("provider_not_implemented");
    expect(JSON.stringify(dispatchPlanAfterCreate)).not.toContain("PrivateName");
    expect(workerTickAfterCreate.executed).toBe(false);
    expect(workerTickAfterCreate.plan.task?.id).toBe(createdDownloadTask.task.id);
    expect(selectDownloadTaskStatus(sqlite, createdDownloadTask.task.id)).toBe("queued");
    await expect(createDownloadTask({ comicResourceId: metadataResource.id, provider: "openlist" })).rejects.toThrow("不能使用 openlist 下载");

    const canceledDownloadTask = await cancelDownloadTask(createdDownloadTask.task.id);
    const downloadableResourcesAfterCancel = await listDownloadableResources();
    const recreatedDownloadTask = await createDownloadTask({ comicResourceId: metadataResource.id });

    await expect(retryDownloadTask(createdDownloadTask.task.id)).rejects.toThrow("已有活动下载任务");

    const canceledRecreatedDownloadTask = await cancelDownloadTask(recreatedDownloadTask.task.id);
    const retriedDownloadTask = await retryDownloadTask(createdDownloadTask.task.id);
    const downloadableResourcesAfterRetry = await listDownloadableResources();
    const downloadTaskEventsAfterRetry = await listDownloadTaskEvents();
    const dispatchPlanAfterRetry = await planNextDownloadDispatch();

    expect(canceledDownloadTask.task.status).toBe("canceled");
    expect(downloadableResourcesAfterCancel.find((resource) => resource.id === metadataResource.id)?.activeTaskCount).toBe(0);
    expect(recreatedDownloadTask.created).toBe(true);
    expect(recreatedDownloadTask.task.id).not.toBe(createdDownloadTask.task.id);
    expect(canceledRecreatedDownloadTask.task.status).toBe("canceled");
    expect(retriedDownloadTask.task.status).toBe("queued");
    expect(retriedDownloadTask.task.retryCount).toBe(1);
    expect(downloadableResourcesAfterRetry.find((resource) => resource.id === metadataResource.id)?.activeTaskCount).toBe(1);
    expect(countRows(sqlite, "operation_logs", "operation = 'download_task_create'")).toBe(2);
    expect(countRows(sqlite, "operation_logs", "operation = 'download_task_cancel'")).toBe(2);
    expect(countRows(sqlite, "operation_logs", "operation = 'download_task_retry'")).toBe(1);
    expect(downloadTaskEventsAfterRetry.filter((event) => event.operation === "download_task_create")).toHaveLength(2);
    expect(downloadTaskEventsAfterRetry.filter((event) => event.operation === "download_task_cancel")).toHaveLength(2);
    expect(downloadTaskEventsAfterRetry.filter((event) => event.operation === "download_task_retry")).toHaveLength(1);
    expect(downloadTaskEventsAfterRetry.find((event) => event.operation === "download_task_retry")?.retryCount).toBe(1);
    expect(dispatchPlanAfterRetry.task?.id).toBe(createdDownloadTask.task.id);
    expect(dispatchPlanAfterRetry.status).toBe("blocked");
    await expect(retryDownloadTask(createdDownloadTask.task.id)).rejects.toThrow("只有失败或已取消的任务可以重试");

    const metadataStatusAfterImport = await checkMetadataSourceStatus({
      site: "examplesite",
      sourceId: "gallery-123",
      sourceUrl: "https://example.test/g/gallery-123",
    });

    expect(metadataStatusAfterImport.imported).toBe(true);
    expect(metadataStatusAfterImport.matchedBy).toBe("source_id");
    expect(metadataStatusAfterImport.comicId).toBe(comicAId);
    expect(metadataStatusAfterImport.comicStatus).toBe("readable");
    expect(metadataStatusAfterImport.hasLocalFile).toBe(true);
    expect(metadataStatusAfterImport.localReadable).toBe(true);
    expect(metadataStatusAfterImport.resourceCount).toBe(1);

    const repeatedMetadataImport = await importMetadataPayload({
      site: "examplesite",
      sourceId: "gallery-123",
      sourceUrl: "https://example.test/g/gallery-123?updated=1",
      title: "Remote Metadata Title Updated",
      resources: [
        {
          type: "magnet",
          url: "magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12&dn=PrivateName",
          label: "更新磁链",
        },
      ],
    });

    expect(repeatedMetadataImport.comicId).toBe(comicAId);
    expect(repeatedMetadataImport.matchedBy).toBe("source");
    expect(countRows(sqlite, "comic_sources", "site = 'examplesite'")).toBe(1);
    expect(countRows(sqlite, "comic_resources", `comic_id = '${comicAId}'`)).toBe(1);
    expect(selectComicResource(sqlite, comicAId).displayLabel).toBe("更新磁链");

    const archiveComicId = selectComicIdByFileTitle(sqlite, "Archive Comic");
    const localTitleStatusBeforeImport = await checkMetadataSourceStatus({
      site: "examplesite",
      sourceUrl: "https://example.test/g/archive-comic",
      title: "Archive Comic",
    });

    expect(localTitleStatusBeforeImport.imported).toBe(false);
    expect(localTitleStatusBeforeImport.localMatchComicId).toBe(archiveComicId);
    expect(localTitleStatusBeforeImport.localMatchReadable).toBe(true);

    const localTitleImport = await importMetadataPayload({
      site: "ExampleSite",
      sourceUrl: "https://example.test/g/archive-comic",
      title: "Archive Comic",
      tags: [{ namespace: "group", name: "Archive Metadata Group" }],
    });

    expect(localTitleImport.createdComic).toBe(false);
    expect(localTitleImport.matchedBy).toBe("local_title");
    expect(localTitleImport.comicId).toBe(archiveComicId);
    expect(localTitleImport.localReadable).toBe(true);
    expect(countRows(sqlite, "comics")).toBe(2);

    const localTitleStatusAfterImport = await checkMetadataSourceStatus({
      site: "examplesite",
      sourceUrl: "https://example.test/g/archive-comic",
    });

    expect(localTitleStatusAfterImport.imported).toBe(true);
    expect(localTitleStatusAfterImport.comicId).toBe(archiveComicId);
    expect(localTitleStatusAfterImport.localReadable).toBe(true);

    const remoteOnlyImport = await importMetadataPayload({
      site: "ExampleSite",
      sourceUrl: "https://example.test/g/remote-only",
      title: "Remote Only Comic",
      tags: [{ namespace: "artist", name: "Remote Artist" }],
    });
    const remoteOnlyPublicRows = await comicRepository.searchReadableCards({ query: "Remote Only", pageSize: 12 });

    expect(remoteOnlyImport.createdComic).toBe(true);
    expect(remoteOnlyImport.comicStatus).toBe("remote_only");
    expect(remoteOnlyImport.localReadable).toBe(false);
    expect(remoteOnlyPublicRows.total).toBe(0);

    const remoteOnlyStatus = await checkMetadataSourceStatus({
      site: "examplesite",
      sourceUrl: "https://example.test/g/remote-only",
    });

    expect(remoteOnlyStatus.imported).toBe(true);
    expect(remoteOnlyStatus.matchedBy).toBe("source_url");
    expect(remoteOnlyStatus.comicId).toBe(remoteOnlyImport.comicId);
    expect(remoteOnlyStatus.comicStatus).toBe("remote_only");
    expect(remoteOnlyStatus.hasLocalFile).toBe(false);
    expect(remoteOnlyStatus.localReadable).toBe(false);

    const duplicateComicId = randomUUID();
    sqlite
      .prepare(
        "insert into comics (id, display_title, file_title, sort_title, status) values (?, ?, ?, ?, ?)",
      )
      .run(duplicateComicId, "Comic A Duplicate", "Comic A duplicate folder", storedMetadata.sortTitle, "readable");

    const { createDuplicateCandidateRepository } = await import("./duplicate-candidates.repository");
    const duplicateGroups = await createDuplicateCandidateRepository().listGroups();
    const duplicateGroup = duplicateGroups.find((group) => group.sortTitle === storedMetadata.sortTitle);

    expect(duplicateGroup?.totalCount).toBe(2);
    expect(duplicateGroup?.candidates.map((candidate) => candidate.id).sort()).toEqual([comicAId, duplicateComicId].sort());

    sqlite.prepare("delete from comics where id = ?").run(duplicateComicId);

    const tagFilters = await comicRepository.listReadableTagFilters();
    const tagSearchResult = await comicRepository.searchReadableCards({ query: "示例作者改", pageSize: 12 });
    const taggedResult = await comicRepository.searchReadableCards({ tags: [createdTag.canonical], pageSize: 12 });

    expect(tagFilters.some((tag) => tag.canonical === createdTag.canonical && tag.comicCount === 1)).toBe(true);
    expect(tagSearchResult.items.map((comic) => comic.id)).toContain(comicAId);
    expect(taggedResult.total).toBe(1);
    expect(taggedResult.items[0]?.id).toBe(comicAId);

    const { createComicMaintenanceRepository } = await import("./comic-maintenance.repository");
    const maintenanceRepository = createComicMaintenanceRepository();
    const { createComicMergeRepository } = await import("./comic-merge.repository");
    const mergeRepository = createComicMergeRepository();
    const mergeResult = await mergeRepository.mergeAsChapter(archiveComicId, comicAId);
    const mergedTargetDetail = await comicRepository.getDetail(comicAId);
    const mergedTargetReader = await comicRepository.getReaderData(comicAId);
    const publicRowsAfterMerge = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(mergeResult.physicalFilesTouched).toBe(false);
    expect(mergeResult.targetComicId).toBe(comicAId);
    expect(selectComicStatus(sqlite, archiveComicId).status).toBe("hidden");
    expect(selectComicMergeState(sqlite, archiveComicId).parentComicId).toBe(comicAId);
    expect(mergedTargetDetail?.chapterCount).toBe(2);
    expect(mergedTargetReader?.pages.length).toBe(4);
    expect(publicRowsAfterMerge.items.some((comic) => comic.id === archiveComicId)).toBe(false);
    expect(countRows(sqlite, "operation_logs", "operation = 'merge_chapter'")).toBe(1);

    const targetChapters = mergedTargetDetail?.chapters ?? [];
    const { createComicChapterOrderRepository } = await import("./comic-chapter-order.repository");
    const chapterOrderRepository = createComicChapterOrderRepository();
    const reorderedChapters = await chapterOrderRepository.updateOrder(
      comicAId,
      targetChapters.map((chapter) => chapter.id).reverse(),
    );
    const reorderedTargetDetail = await comicRepository.getDetail(comicAId);
    const reorderedTargetReader = await comicRepository.getReaderData(comicAId);

    expect(reorderedChapters.physicalFilesTouched).toBe(false);
    expect(reorderedTargetDetail?.chapters.map((chapter) => chapter.id)).toEqual(targetChapters.map((chapter) => chapter.id).reverse());
    expect(reorderedTargetReader?.pages[0]?.chapterId).toBe(targetChapters[1]?.id);

    await expect(maintenanceRepository.changeStatus(archiveComicId, "restore")).rejects.toThrow("已合并为章节");

    const restoreMergeResult = await mergeRepository.restoreMergedComic(archiveComicId);
    const restoredTargetDetail = await comicRepository.getDetail(comicAId);
    const restoredSourceDetail = await comicRepository.getDetail(archiveComicId);
    const publicRowsAfterMergeRestore = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(restoreMergeResult.physicalFilesTouched).toBe(false);
    expect(selectComicStatus(sqlite, archiveComicId).status).toBe("readable");
    expect(selectComicMergeState(sqlite, archiveComicId).parentComicId).toBeNull();
    expect(restoredTargetDetail?.chapterCount).toBe(1);
    expect(restoredSourceDetail?.chapterCount).toBe(1);
    expect(publicRowsAfterMergeRestore.items.some((comic) => comic.id === archiveComicId)).toBe(true);

    const { saveReadingProgress } = await import("../reader/reading-progress");
    const savedDirectoryProgress = await saveReadingProgress({
      pageId: directoryPage.id,
      progressPercent: 25,
    });
    const updatedDirectoryProgress = await saveReadingProgress({
      pageId: secondDirectoryPage.id,
      progressPercent: 50,
    });
    const savedArchiveProgress = await saveReadingProgress({
      pageId: archivePage.id,
      progressPercent: 150,
    });

    expect(savedDirectoryProgress?.progressPercent).toBe(25);
    expect(updatedDirectoryProgress?.progressPercent).toBe(50);
    expect(savedArchiveProgress?.progressPercent).toBe(100);
    expect(countRows(sqlite, "reading_progress")).toBe(2);
    expect(selectLastReadPageId(sqlite, updatedDirectoryProgress?.comicId ?? "")).toBe(secondDirectoryPage.id);
    expect(selectLastReadPageId(sqlite, savedArchiveProgress?.comicId ?? "")).toBe(archivePage.id);

    const secondScan = await scanMangaRoot(root.id);

    expect(secondScan.addedCount).toBe(0);
    expect(secondScan.missingCount).toBe(0);
    expect(countRows(sqlite, "cache_entries", "kind = 'archive_file_list'")).toBe(1);

    const { scanAllEnabledMangaRoots } = await import("./scan-all-manga-roots");
    sqlite
      .prepare("insert into manga_roots (id, absolute_path, scan_mode, is_enabled) values (?, ?, ?, ?)")
      .run(randomUUID(), path.join(workspace, "Disabled Root"), "children_as_comics", 0);

    const scanAllEnabledOnly = await scanAllEnabledMangaRoots();

    expect(scanAllEnabledOnly.enabledRootCount).toBe(1);
    expect(scanAllEnabledOnly.scannedRootCount).toBe(1);
    expect(scanAllEnabledOnly.failedRootCount).toBe(0);
    expect(scanAllEnabledOnly.addedCount).toBe(0);

    const missingRootId = randomUUID();
    sqlite
      .prepare("insert into manga_roots (id, absolute_path, scan_mode, is_enabled) values (?, ?, ?, ?)")
      .run(missingRootId, path.join(workspace, "Missing Root"), "children_as_comics", 1);

    const scanAllWithFailure = await scanAllEnabledMangaRoots();

    expect(scanAllWithFailure.enabledRootCount).toBe(2);
    expect(scanAllWithFailure.scannedRootCount).toBe(1);
    expect(scanAllWithFailure.failedRootCount).toBe(1);
    expect(scanAllWithFailure.roots.find((scanRoot) => scanRoot.mangaRootId === missingRootId)?.status).toBe("failed");
    expect(countRows(sqlite, "scan_sessions", "status = 'failed'")).toBe(1);

    await rm(directoryComicPath, { recursive: true, force: true });

    const thirdScan = await scanMangaRoot(root.id);

    expect(thirdScan.addedCount).toBe(0);
    expect(thirdScan.missingCount).toBe(1);
    expect(countRows(sqlite, "local_files", "is_missing = 1")).toBe(1);

    const publicRowsAfterMissing = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(publicRowsAfterMissing.items.some((comic) => comic.fileTitle === "Comic A")).toBe(false);

    const repairedComicPath = path.join(rootPath, "Comic A repaired");
    await mkdir(repairedComicPath, { recursive: true });
    await writeFile(path.join(repairedComicPath, "001.jpg"), jpegFixture);

    const { createFileMaintenanceRepository } = await import("../local-files/file-maintenance.repository");
    const missingLocalFileId = selectMissingLocalFileId(sqlite);
    const repairResult = await createFileMaintenanceRepository().repairMissingPath(missingLocalFileId, repairedComicPath);

    expect(repairResult.absolutePath).toBe(repairedComicPath);
    expect(countRows(sqlite, "local_files", "is_missing = 1")).toBe(0);
    expect(countRows(sqlite, "operation_logs", "operation = 'path_repair'")).toBe(1);

    const publicRowsAfterRepair = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(publicRowsAfterRepair.items.some((comic) => comic.id === comicAId)).toBe(true);

    const hiddenComic = await maintenanceRepository.changeStatus(comicAId, "hide");
    const publicRowsAfterHide = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(hiddenComic.previousStatus).toBe("readable");
    expect(hiddenComic.status).toBe("hidden");
    expect(selectComicStatus(sqlite, comicAId).status).toBe("hidden");
    expect(publicRowsAfterHide.items.some((comic) => comic.id === comicAId)).toBe(false);
    expect(countRows(sqlite, "operation_logs", "operation = 'hide'")).toBe(1);

    const deletedComic = await maintenanceRepository.changeStatus(comicAId, "soft_delete");

    expect(deletedComic.previousStatus).toBe("hidden");
    expect(deletedComic.status).toBe("deleted");
    expect(selectComicStatus(sqlite, comicAId).status).toBe("deleted");
    expect(countRows(sqlite, "operation_logs", "operation = 'soft_delete'")).toBe(1);

    const restoredComic = await maintenanceRepository.changeStatus(comicAId, "restore");
    const restoredStatus = selectComicStatus(sqlite, comicAId);
    const publicRowsAfterRestore = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(restoredComic.previousStatus).toBe("deleted");
    expect(restoredComic.status).toBe("readable");
    expect(restoredStatus.status).toBe("readable");
    expect(restoredStatus.hiddenAt).toBeNull();
    expect(restoredStatus.deletedAt).toBeNull();
    expect(publicRowsAfterRestore.items.some((comic) => comic.id === comicAId)).toBe(true);
    expect(countRows(sqlite, "operation_logs", "operation = 'restore'")).toBe(2);

    const { createSqliteBackupDownload } = await import("../core/db/backup");
    const backup = await createSqliteBackupDownload();
    const backupPath = path.join(workspace, backup.filename);

    await writeFile(backupPath, backup.data);

    const backupSqlite = new Database(backupPath);

    expect(backup.filename).toMatch(/^mangatest-.+\.sqlite$/);
    expect(backup.sizeBytes).toBeGreaterThan(0);
    expect(countRows(backupSqlite, "comics")).toBe(3);
    expect(countRows(backupSqlite, "reading_progress")).toBe(2);
    expect(countRows(backupSqlite, "operation_logs")).toBeGreaterThanOrEqual(4);

    backupSqlite.close();
    sqlite.close();
  });
});

function countRows(sqlite: Database.Database, tableName: string, whereClause = "1 = 1") {
  const row = sqlite.prepare(`select count(*) as count from ${tableName} where ${whereClause}`).get() as {
    count: number;
  };

  return row.count;
}

function tableExists(sqlite: Database.Database, tableName: string) {
  const row = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
}

function selectPageBySourceKind(sqlite: Database.Database, sourceKind: "filesystem" | "archive", offset = 0) {
  return sqlite
    .prepare("select id from pages where source_kind = ? order by page_number limit 1 offset ?")
    .get(sourceKind, offset) as { id: string };
}

function selectPageDimensions(sqlite: Database.Database, pageId: string) {
  return sqlite
    .prepare("select width, height from pages where id = ?")
    .get(pageId) as { width: number | null; height: number | null } | undefined;
}

function selectLastReadPageId(sqlite: Database.Database, comicId: string) {
  const row = sqlite.prepare("select last_read_page_id as pageId from comics where id = ?").get(comicId) as
    | { pageId: string | null }
    | undefined;

  return row?.pageId ?? null;
}

function selectMissingLocalFileId(sqlite: Database.Database) {
  const row = sqlite.prepare("select id from local_files where is_missing = 1 limit 1").get() as { id: string };
  return row.id;
}

function selectComicIdByFileTitle(sqlite: Database.Database, fileTitle: string) {
  const row = sqlite.prepare("select id from comics where file_title = ?").get(fileTitle) as { id: string };
  return row.id;
}

function selectComicStatus(sqlite: Database.Database, comicId: string) {
  return sqlite
    .prepare("select status, hidden_at as hiddenAt, deleted_at as deletedAt from comics where id = ?")
    .get(comicId) as {
    status: string;
    hiddenAt: string | null;
    deletedAt: string | null;
  };
}

function selectComicMergeState(sqlite: Database.Database, comicId: string) {
  return sqlite
    .prepare("select parent_comic_id as parentComicId, merged_as_chapter_id as mergedAsChapterId from comics where id = ?")
    .get(comicId) as {
    parentComicId: string | null;
    mergedAsChapterId: string | null;
  };
}

function selectComicMetadata(sqlite: Database.Database, comicId: string) {
  return sqlite
    .prepare(
      "select display_title as displayTitle, file_title as fileTitle, original_title as originalTitle, metadata_query_title as metadataQueryTitle, sort_title as sortTitle from comics where id = ?",
    )
    .get(comicId) as {
    displayTitle: string;
    fileTitle: string;
    originalTitle: string | null;
    metadataQueryTitle: string | null;
    sortTitle: string;
  };
}

function selectComicResource(sqlite: Database.Database, comicId: string) {
  return sqlite
    .prepare(
      "select id, resource_type as resourceType, display_label as displayLabel, resource_url as resourceUrl, redacted_resource as redactedResource from comic_resources where comic_id = ? limit 1",
    )
    .get(comicId) as {
    id: string;
    resourceType: string;
    displayLabel: string | null;
    resourceUrl: string | null;
    redactedResource: string | null;
  };
}

function selectComicTagSource(sqlite: Database.Database, comicId: string, canonical: string) {
  return sqlite
    .prepare(
      `
      select comic_tags.source as source, comic_tags.is_user_edited as isUserEdited
      from comic_tags
      inner join tags on tags.id = comic_tags.tag_id
      where comic_tags.comic_id = ? and tags.canonical = ?
      `,
    )
    .get(comicId, canonical) as {
    source: string;
    isUserEdited: number;
  };
}

function selectDownloadTaskStatus(sqlite: Database.Database, taskId: string) {
  const row = sqlite.prepare("select status from download_tasks where id = ?").get(taskId) as { status: string } | undefined;
  return row?.status ?? null;
}

function createStoredZip(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name);
    const crc = crc32(entry.data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((size, part) => size + part.length, 0);
  const endOfCentralDirectory = Buffer.alloc(22);

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});
