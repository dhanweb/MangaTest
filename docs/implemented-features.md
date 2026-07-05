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

### Search And Tags

- Public library search matches comic titles and bound tag text.
- Public library supports tag filtering through canonical tags.
- Public library supports pagination and sort modes for recent, title, and page count.
- Tags can be created and edited in admin.
- Comic tags can be assigned and removed in admin comic management.
- Tags store namespace, name, canonical text, optional Chinese display name, aliases JSON, and comic counts.

### Admin And Maintenance

- Admin home shows scan status, missing file count, duplicate candidate count, storage/cache summary, and recent operation logs.
- File maintenance lists missing local files.
- Missing local file paths can be repaired by updating database paths only; the app does not move, copy, or delete physical files.
- Comic records can be hidden, soft-deleted, and restored.
- Dangerous maintenance actions write operation log entries.
- SQLite backup can be exported from settings.
- Cache summary and cleanup support media assets and archive file-list cache entries.

### Settings

- Runtime settings persist cache directory, cache size, reader thumbnail TTL, reader preload behavior, reader sidebar default, immersive reader default, listen host, and theme mode.
- MVP theme mode is fixed to light to avoid unadapted dark-mode contrast regressions.

## Not Implemented Yet

- Browser extension and metadata ingest.
- OpenList, 115, aria2, magnet, torrent, and cloud download workflows.
- File watching and startup auto-scan.
- Physical file deletion.
- Multi-user accounts or login.
- Dark theme.
- RAR, CBR, 7z, and PDF scanning.
- Collections, reading queues, and auto-next workflows.
