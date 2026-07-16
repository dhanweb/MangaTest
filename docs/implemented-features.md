# Implemented Features

This document records features that are already implemented in `apps/web`.
`docs/plan.md` remains the source of truth for product scope and future phases.

## Documentation Rules

- Update this file in the same change whenever a user-visible feature, API, module behavior, or important workflow is completed.
- Keep entries factual and testable. Prefer "can do X" over roadmap language.
- Do not list prototype-only behavior from `apps/prototype` unless the same behavior exists in `apps/web`.
- Put unfinished, deferred, or future-scope items under "Not Implemented Yet" instead of mixing them into completed sections.
- If a completed feature changes behavior, update the existing bullet instead of adding a duplicate.

## Current Manual Test Entry Points

- Web app: `http://127.0.0.1:4317`
- Admin home: `http://127.0.0.1:4317/admin`
- Manga roots: `http://127.0.0.1:4317/admin/paths`
- File maintenance: `http://127.0.0.1:4317/admin/files`
- Comic management: `http://127.0.0.1:4317/admin/comics`
- Tag management: `http://127.0.0.1:4317/admin/tags`
- Collections admin: `http://127.0.0.1:4317/admin/collections`
- Public collections: `http://127.0.0.1:4317/collections`
- Download tasks: `http://127.0.0.1:4317/admin/downloads`
- Settings: `http://127.0.0.1:4317/admin/settings`

## Implemented In `apps/web`

### Local Library

- Configure one or more manga roots with absolute filesystem paths.
- The built-in system default manga root path can be edited from admin paths; a confirm step asks whether to physically move contained comics. Choosing yes moves children into the new empty directory and rewrites related local_files / finalization paths; choosing no rewrites database paths only. User manga roots still cannot change absolute path here.
- Adding a manga root automatically starts one scan for that root.
- Configured manga roots can also be scanned manually from the manga roots admin page.
- The MVP scan mode treats each direct child directory, `.zip`, or `.cbz` file as one comic.
- Scan imports create `comic`, `local_file`, `chapter`, and `page` records.
- Re-scanning an existing root marks missing local files and clears the missing marker when files return.
- Scan sessions record status, added count, missing count, duplicate candidate count, recoverable count, and error summary.
- Public library pages list only readable local comics whose primary local file is not missing.
- Admin comic management can show readable, missing, hidden, deleted, and remote-only status records.

### Reader

- Reader page data is read by comic id, then rendered as a vertical reader.
- Page images are served through `/api/pages/[pageId]`; clients do not pass arbitrary filesystem paths.
- Directory, `.zip`, and `.cbz` pages can be read through the same page image API.
- Reading progress is saved by `pageId` and updates comic-level last-read fields.
- Reader preferences are persisted for preload, preload distance, thumbnail sidebar default, and immersive default.
- Reader thumbnails are generated lazily through `/api/pages/[pageId]/thumbnail`.
- Reader thumbnail cache records use `media_assets`, include source identity and dimensions in cache keys, and update `lastAccess`.
- Reader supports keyboard shortcuts: `Up/W`, `Down/S`, `Space`, `Shift+Space`, `Home`, `End`, `T`, and `Esc`.
- Reader renders cross-chapter separator bars when pages transition between chapters within the same comic.
- Reader can show queue context and a "continue to next comic" entry when the current comic belongs to an enabled reading queue.

### Covers And Media Assets

- Reader thumbnails are implemented.
- Comic list/detail cover images are implemented by a safe comic-id API and fall back to generated placeholders if no cover can be produced.
- Admin comic management can upload manual cover images that take priority over generated covers.
- Admin comic management can clear and regenerate generated cover caches for readable local comics.

### Search And Tags

- Public library search matches comic titles and bound tag text.
- Public library supports tag filtering through canonical tags.
- Public library supports pagination and sort modes for recent, title, and page count.
- Tags can be created and edited in admin.
- Comic tags can be assigned and removed in admin comic management.
- Tags store namespace, name, canonical text, optional Chinese display name, aliases JSON, and comic counts.

### Metadata Ingest

- `/api/metadata/import` accepts token-protected metadata submissions for future browser extension detail-page imports.
- Metadata imports can enrich an explicit existing comic or create a remote-only comic when no local comic is matched.
- Metadata imports can match a single existing local comic by normalized metadata title when no source record exists yet.
- Metadata imports save source records, redacted resource display fields, canonical tags, and comic tag bindings without overwriting user-edited display titles or manual tag bindings.

### Browser Extension

- `apps/extension` contains a Chrome Manifest V3 extension that can be loaded unpacked during development.
- The extension popup stores the local MangaTest service URL, metadata import token, and source-site name.
- The extension can collect a generic manga detail-page metadata preview from the active tab and submit it to `/api/metadata/import`.
- The extension supports a site-adapter layer before falling back to generic metadata collection.
- The extension can query `/api/metadata/status` to show whether the current source is already imported, title-matchable to a local comic, remote-only, missing, or locally readable.

### Downloads

- `/api/downloads` lists imported downloadable resources and queued download tasks.
- Admin download tasks can create queued `download_task` records from `comic_resource` records.
- Download task creation uses the configured default download directory when no per-task target directory is provided.
- Download task creation chooses the default provider from resource type: magnet/torrent uses aria2, HTTP uses builtin HTTP, and OpenList resources use OpenList.
- Download task creation rejects incompatible resource/provider combinations and reuses an existing queued/running task for the same resource and provider.
- Queued download tasks can be canceled, and failed or canceled tasks can be manually retried back into the queue.
- Download task create, cancel, retry, and pull-back actions write operation log entries with redacted resource details.
- Pull-back from a completed offline task returns structured failure reasons (settings missing, OpenList list HTTP/API error, timeout, empty remote directory) and surfaces them in the admin UI toast and API response `code`/`details`.
- Pull-back scans one nested directory level under the offline save path (115 often creates a same-named folder) and matches by resource label / title / parent folder before falling back to the largest file.
- Download provider adapters are registered for OpenList, aria2, and builtin HTTP as provider-boundary stubs.
- Download worker preflight can select the next queued task and report provider readiness without executing external downloads.
- OpenList settings include a read-only connection check that probes public and account APIs without creating download tasks or returning tokens to the client.
- OpenList settings can exchange a username/password/OTP login for a token, storing only the token in local runtime settings.
- OpenList dispatch preflight can read-only probe a configured remote path through `/api/fs/get` and report safe file metadata without executing downloads.
- OpenList dispatch preflight can read-only list the first page of a configured remote directory through `/api/fs/list` and report safe directory preview metadata.
- OpenList cloud directory scans can persist a bounded paginated read-only scan session and entry summaries without storing raw download URLs or executing downloads.
- OpenList cloud scan file entries can be imported as OpenList `comic_resource` records for the same comic without creating download tasks.
- OpenList download worker preflight can persist per-task download preparation records for reachable file resources that expose a raw download URL, without storing the raw URL.
- OpenList download worker execution can stream a prepared file resource into a local temporary download path under the configured cache directory without storing or returning the raw URL.
- When OpenList offline submit returns duplicate task (code 10008 / 任务已存在), the app searches the flat root `/115Open/HENTAI/exhentai/{mangaName}/` for a matching zip/cbz (live `fs/list`, root refresh once), completes the offline task, and creates a transfer with the archive file path. If not found or ambiguous, the task fails with Chinese guidance to move files under that root and retry.
- OpenList offline (magnet) tasks submit to OpenList once at create/retry via `dispatchTaskNow`; plugin `import-with-magnet` only calls `createDownloadTask` and does not re-submit. The offline worker tick only polls submitted OpenList tasks and creates transfer tasks when complete.
- When aria2 is used (native magnet/torrent tasks or OpenList transfer via aria2), files are written directly under the download import root; finalization scans and records inalPath without moving the file so aria2 logs remain valid. Non-aria2 stream downloads still use cache temp + move.
- Completed OpenList temporary downloads can be moved into a local download inbox manga root and trigger a library scan for the finalized file.
- Download admin UI shows resource rows, provider compatibility, active task state, task status, target directory, and redacted resource display text.
- Download admin UI can cancel queued/running tasks and retry failed/canceled tasks without invoking provider execution.
- Download admin UI can manually run the safe worker step and show each task's latest preparation, temporary download, and inbox finalization status.
- Download admin UI shows recent task activity for create, cancel, and retry events.
- Download admin UI shows the current worker dispatch preflight status for the next queued task.

### Collections And Reading Queues

- Collections support two kinds: `collection` for favorites categories and `queue` for reading queues.
- Each collection stores name, description, kind, sort mode (`manual`, `recent_added`, `title`), and enabled flag.
- Admin can create, update, delete, enable/disable collections, and the actions write redacted operation log entries.
- Admin can add readable comics to a collection, remove them, and reorder manual sort order.
- Adding a non-readable comic to a collection is rejected; duplicate adds are no-ops.
- Public `/collections` page lists all collections with kind, comic count, and enabled state.
- Public `/collections/[id]` page shows the collection's readable comics in the configured sort order and offers a "start queue" entry for queue-kind collections.
- Reader resolves queue context for the current comic and renders a "continue to next comic" entry at the end when a next comic exists in the queue.
- `findQueueContaining` and `getQueueContext` resolve the enabled queue a comic belongs to and its next comic, position, and total count.

### Admin And Maintenance

- Admin home shows scan status, missing file count, duplicate candidate count, storage/cache summary, and recent operation logs.
- File maintenance lists missing local files.
- File maintenance lists duplicate candidate groups by normalized title and can hide or soft-delete candidate comic records without touching physical files.
- File maintenance can trigger scans for all enabled manga roots and refresh maintenance data after scanning.
- Missing local file paths can be repaired by updating database paths only; the app does not move, copy, or delete physical files.
- Comic records can be hidden, soft-deleted, and restored.
- Admin comic management can edit `display_title`, `original_title`, and `metadata_query_title` while preserving the scanned `file_title`.
- Admin comic management can merge a readable single-chapter comic into another readable comic as a chapter, then restore it as an independent comic without moving, copying, or deleting physical files.
- Admin comic management can reorder chapters for an independent comic and persist the order through `sort_order`.
- Dangerous maintenance actions write operation log entries.
- Admin collections management can create, update, enable/disable, and delete collections, and add/remove/reorder comics with redacted operation log entries.
- SQLite backup can be exported from settings.
- Settings can selectively clear cache, library/manga records, and download tasks while preserving runtime settings and manga roots; physical manga files are never deleted.
- Cache summary and cleanup support media assets and archive file-list cache entries.
- /api/settings/data-reset exposes data volume summary and confirmed selective wipe operations.

### Settings

- Runtime settings persist cache directory, cache size, reader thumbnail TTL, reader preload behavior, reader sidebar default, immersive reader default, listen host, and theme mode.
- Runtime settings persist the browser metadata import token used by `/api/metadata/import`.
- Runtime settings persist download default target directory plus OpenList enabled/base URL/token fields for future provider execution.
- MVP theme mode is fixed to light to avoid unadapted dark-mode contrast regressions.

## Not Implemented Yet

- Additional site-specific browser extension adapters and list-page batch collection.
- Provider execution for OpenList, 115, aria2, builtin HTTP, magnet, torrent, and cloud download workflows.
- File watching and startup auto-scan.
- Physical file deletion.
- Multi-user accounts or login.
- Dark theme.
- RAR, CBR, 7z, and PDF scanning.
