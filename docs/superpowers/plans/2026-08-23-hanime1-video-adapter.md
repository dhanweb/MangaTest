# Hanime1 Video Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan inline in the isolated worktree, keeping the listed test checkpoints.

**Goal:** Add an end-to-end Chrome MV3 adapter for `hanime1.me/watch?v=...` that collects video metadata, opens hanime1's official `/download?v=...` page, and submits one of its download-page resources to the local video library.

**Architecture:** Keep site-specific selectors and URL identity inside `apps/extension/src/adapters/hanime1/adapter.js`. Extend the existing normalized collector contract with a `video` payload, expose a generic `features/video` bridge, and put root selection, placeholder video/source/resource records, tagging, and aria2 task creation in `apps/web/src/modules/metadata-ingest/video-import.ts` behind `/api/videos/import`.

**Tech Stack:** Chrome Manifest V3, browser content scripts, JavaScript fixture checks, Next.js App Router, TypeScript, Drizzle/SQLite, existing video-library and aria2 modules.

## Global Constraints

- `docs/plan.md` remains the source of truth and now explicitly includes the hanime1 video adapter as the first concrete `submitVideo` implementation.
- Only hanime1 watch/download pages matching `https://hanime1.me/watch?v=<id>` are supported; no list-page batch collection, login automation, CAPTCHA handling, or arbitrary filesystem paths.
- The detail page only opens hanime1's official `/download?v=<id>` page. Download URLs are read from that page's `a[data-url]` entries and passed to the local server unchanged; the adapter does not inspect playback-page `<video><source>` elements or derive alternate media URLs.
- Every extension source change keeps `apps/extension/manifest.json` and `apps/extension/package.json` on the same version; feature changes use a minor bump and fixes use a patch bump.
- Video downloads require an enabled video root and the existing aria2 settings; the API returns a clear error otherwise.

### Task 1: Add the normalized video contract and generic feature bridge

**Files:**
- Modify: `apps/extension/src/runtime/metadata-contract.js`
- Modify: `apps/extension/src/runtime/collector.js`
- Modify: `apps/extension/src/backend/client.js`
- Create: `apps/extension/src/features/video/submit.js`
- Modify: `apps/extension/manifest.json`
- Modify: `apps/extension/scripts/check-extension.mjs`

**Interfaces:**
- `MangaTestMetadataContract.normalizeMetadataPayload(input)` returns `mediaType` and `video: { durationSeconds, sources } | null`.
- `MangaTestBackend.submitVideo(metadata)` POSTs the normalized payload to `/api/videos/import`.
- `MangaTestVideoFeature.submit(metadata)` validates `mediaType === "video"` and delegates to `submitVideo`.

- [x] Add `mediaType` and normalized video sources without changing manga defaults.
- [x] Merge adapter-provided `mediaType` and `video` fields in the generic collector.
- [x] Register the feature in the content-script load order and add fixture assertions for video output.
- [x] Run `npm run check -w apps/extension`; expected output ends with `Extension manifest and collector checks passed.`

### Task 2: Implement and fixture-test the hanime1 detail-page adapter

**Files:**
- Create: `apps/extension/src/adapters/hanime1/adapter.js`
- Create: `apps/extension/test-fixtures/hanime1-watch.html`
- Modify: `apps/extension/manifest.json`
- Modify: `apps/extension/scripts/check-extension.mjs`

**Interfaces:**
- Adapter id: `hanime1`.
- Detail page id: `hanime1-video`.
- Capabilities: `metadata`, `video`.
- Source identity: `site = "hanime1.me"`, `sourceId = "hanime1.me/watch?v=<id>"`.

- [x] Match only `hanime1.me` watch URLs with a numeric `v` query value.
- [x] Read `h3.video-details-wrapper`, `h4.video-title`, `og:image`, `og:video:duration`, and tag links on the watch page.
- [x] Read `a[data-url]` entries on the official `/download?v=<id>` page, sort them by quality descending, and emit them as HTTP resources.
- [x] Verify the fixture extracts the canonical URL, title, cover, six tags/resources as defined by the fixture, and `video` capability.

### Task 3: Add the server-side video import workflow

**Files:**
- Create: `apps/web/src/modules/metadata-ingest/video-import.ts`
- Modify: `apps/web/src/modules/metadata-ingest/index.ts`
- Create: `apps/web/src/app/api/videos/import/route.ts`
- Modify: `apps/web/src/modules/downloads/index.ts`
- Modify: `apps/web/src/modules/video-library/scan-video-root.ts`
- Create: `apps/web/src/modules/metadata-ingest/video-import.test.ts`

**Interfaces:**
- `importVideoPayload(input: VideoIngestPayload): Promise<VideoImportResult>` validates source identity, title, cover, tags, and HTTP resources.
- The service chooses `input.videoRootId` or the first enabled `video_root`, creates/updates a placeholder `videos` + `video_sources` record, links `video_resources`, and calls `createVideoDownloadTask`.
- The download target is `video root/下载入库/<sanitized title>/`; the scanner recognizes that import subtree and updates the placeholder video when the task completes.

- [x] Write tests for validation, idempotent source reuse, tag assignment, and no-enabled-root failure.
- [x] Add optional `videoId`/`videoSourceId` linkage to video task resource creation.
- [x] Keep official download-page URLs in the resource row while redacting only display/log fields through existing download helpers.
- [x] Run `npm run test -w apps/web -- src/modules/metadata-ingest/video-import.test.ts`; expected result is all video-import tests passing.

### Task 4: Wire the common injector and release checks

**Files:**
- Modify: `apps/extension/src/content/injector.js`
- Modify: `apps/extension/src/popup/popup.js` only if the current UI needs a video-specific label
- Modify: `apps/extension/README.md`
- Modify: `apps/extension/manifest.json`
- Modify: `apps/extension/package.json`

- [x] Show a video-specific panel with one `提交并下载` action and skip manga status calls/auto-gallery behavior for video pages.
- [x] Bump extension versions together.
- [x] Run `npm run check -w apps/extension`, `npm run typecheck -w apps/web`, the focused web test, and `git diff --check`.
- [x] Confirm remaining gaps are limited to live aria2/browser installation QA if those local services are not available.
