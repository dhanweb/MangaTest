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
- Download tasks: `http://127.0.0.1:4317/admin/downloads`
- Settings: `http://127.0.0.1:4317/admin/settings`

## Implemented In `apps/web`

### Local Library

- Configure one or more manga roots with absolute filesystem paths.
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
- Download task create, cancel, and retry actions write operation log entries with redacted resource details.
- Download provider adapters are registered for OpenList, aria2, and builtin HTTP as provider-boundary stubs.
- Download worker preflight can select the next queued task and report provider readiness without executing external downloads.
- Download admin UI shows resource rows, provider compatibility, active task state, task status, target directory, and redacted resource display text.
- Download admin UI can cancel queued/running tasks and retry failed/canceled tasks without invoking provider execution.
- Download admin UI shows recent task activity for create, cancel, and retry events.
- Download admin UI shows the current worker dispatch preflight status for the next queued task.

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
- SQLite backup can be exported from settings.
- Cache summary and cleanup support media assets and archive file-list cache entries.

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
- Collections, reading queues, and auto-next workflows.
