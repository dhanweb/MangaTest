# Video Merge as Episode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an administrator to select a single-episode video and attach it as an episode of another video without moving physical files, with a reversible restore operation.

**Architecture:** Add explicit merge state to `videos`, move the source video's single `video_episodes` row to the target video, and record the previous ownership/order in `operation_logs`. The video scanner must preserve merged episode ownership when it sees the source path again. The admin detail page receives all video rows, filters valid single-episode candidates, and calls a dedicated merge API.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, SQLite, Mantine, Vitest.

## Global Constraints

- Keep physical video files in place; merging only changes database ownership.
- Only a readable video with exactly one non-missing episode may be selected as the source episode.
- A merged source video is hidden from normal video listings and can be restored from its admin detail page.
- Preserve existing Pixiv, pagination, and unrelated worktree changes.
- Do not introduce a new top-level module; keep this behavior under `modules/video-library`.

---

### Task 1: Add merge state, migration, and scan preservation

**Files:**
- Modify: `apps/web/src/modules/core/db/schema.ts`
- Modify: `apps/web/src/modules/core/db/bootstrap.ts`
- Modify: `apps/web/src/modules/video-library/scan-video-root.ts`
- Test: `apps/web/src/modules/video-library/video-merge.repository.test.ts`

**Interfaces:**
- `videos.parentVideoId` and `videos.mergedAsEpisodeId` identify a source video merged into a target.
- `scanVideoRoot` must update facts for a merged episode by root-relative path without moving it back to the source video.

- [ ] **Step 1: Add nullable merge columns and indexes**

Add `parentVideoId` and `mergedAsEpisodeId` to the Drizzle `videos` table, add matching `ensureColumn` calls for existing SQLite databases, and create `videos_parent_idx` if absent.

- [ ] **Step 2: Preserve merged ownership during scans**

Index existing episodes by `(videoRootId, relativePath)`. When a scan sees a path already owned by another video, update its filesystem facts while retaining its `videoId` and `sortOrder`. Keep merged source videos in `hidden` status instead of changing them to `missing_local_file`.

- [ ] **Step 3: Test migration and scan-safe merge state**

In the video merge test, assert the new columns are present after bootstrap and assert that a merged episode remains attached to its target after a root rescan.

### Task 2: Implement the reversible video merge repository and API

**Files:**
- Create: `apps/web/src/modules/video-library/video-merge.repository.ts`
- Modify: `apps/web/src/modules/video-library/index.ts`
- Modify: `apps/web/src/modules/core/db/schema.ts`
- Modify: `apps/web/src/app/api/videos/[id]/merge/route.ts`
- Modify: `apps/web/src/app/api/videos/[id]/status/route.ts`
- Test: `apps/web/src/modules/video-library/video-merge.repository.test.ts`

**Interfaces:**
- `createVideoMergeRepository().mergeAsEpisode(sourceVideoId, targetVideoId)` moves one source episode to the target and returns merge metadata.
- `createVideoMergeRepository().restoreMergedVideo(sourceVideoId)` restores the source video and episode ownership/order.
- `POST /api/videos/:targetId/merge` accepts `{ sourceVideoId }`; `DELETE` restores the source video at `:id`.

- [ ] **Step 1: Write merge/restore tests**

Create two videos in a temporary SQLite database, give the source one episode and the target one episode, assert merge moves only the source episode and records hidden/parent state, assert restore returns the original source ownership and order, and assert a multi-episode source is rejected.

- [ ] **Step 2: Implement the repository transaction**

Validate distinct readable source/target videos, reject already merged videos and multi-episode sources, move the episode with an appended target `sortOrder`, hide the source, save previous state in `operation_logs`, and implement restore from the recorded state. Return `physicalFilesTouched: false`.

- [ ] **Step 3: Add API routes and guard status changes**

Add the route with clear 400/404 responses and return refreshed admin rows plus target detail. Reject hide/delete/status changes on a merged source until it is restored.

### Task 3: Add admin selection and restore UI

**Files:**
- Modify: `apps/web/src/app/admin/videos/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/videos/[id]/video-admin-detail-panel.tsx`

**Interfaces:**
- The page passes `listAdminRows()` to the panel as candidate videos.
- The panel offers a modal that selects another readable, unmerged video with `episodeCount === 1` as the current video's new episode.

- [ ] **Step 1: Add candidate data and merge state**

Track candidate rows, search text, selected source id, pending action, and refreshed target/source detail state in the client panel.

- [ ] **Step 2: Add merge and restore controls**

Add “合并为当前视频的集数” beside episode ordering, show a searchable radio list of valid single-episode candidates, call the new API, refresh episodes, and show a restore action plus target title when viewing a merged source.

- [ ] **Step 3: Preserve existing title, tag, ordering, and status workflows**

Keep current controls working and disable merge/status actions when the current record is already merged.

### Task 4: Verify and commit

**Files:**
- Verify: `apps/web/src/modules/video-library/video-merge.repository.test.ts`
- Verify: `apps/web/src/app/admin/videos/[id]/video-admin-detail-panel.tsx`
- Verify: all changed files with `git diff --check`

- [ ] **Step 1: Run targeted tests, typecheck, lint, and build**

Run `npm run test -w apps/web -- src/modules/video-library/video-merge.repository.test.ts`, `npm run typecheck:web`, targeted ESLint for changed TS/TSX files, and `npm run build:web`.

- [ ] **Step 2: Verify admin API/page behavior**

Use the running local app to confirm `/admin/videos` and a video detail page return 200, and confirm the merge modal and restore state are present in the rendered page.

- [ ] **Step 3: Review and commit**

Review `git diff`, preserve unrelated user changes, run `git diff --check`, then commit the complete intended worktree with message `feat: support merging videos as episodes`.
