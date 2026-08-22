# MangaTest Chrome Extension

Chrome Manifest V3 extension for submitting manga detail-page metadata to the local MangaTest web app.

## Development

Load `apps/extension` as an **unpacked** extension in Chrome (Load unpacked → select this folder).

**No rebuild is required** for day-to-day changes: edit files, then **Reload** the extension on `chrome://extensions`, and refresh open site tabs. Optional zip packaging: `npm run build` → `dist/MangaTest-Extension-v{version}.zip`.

**Version:** every change under `apps/extension/` must bump `manifest.json` `version` (and keep `package.json` in sync). The popup shows `vX.Y.Z` so you can confirm the loaded build.

Before submitting metadata:

1. Start `apps/web` at `http://127.0.0.1:4317`.
2. Open MangaTest admin settings and set a metadata import token.
3. Open an ExHentai gallery detail page in Chrome.
4. Open the extension popup, enter the local service URL and token, and collect a preview.
5. Open the ExHentai torrent page for the same gallery.
6. Collect a preview again, then submit. The extension reuses the last matching gallery metadata, fetches the `.torrent` links with the browser login session, converts them to magnet links locally, and submits the metadata plus magnet resources to MangaTest.

When the status panel shows a single local match, enable "提交到本地漫画" only if the detected page is the same comic. Leaving it unchecked lets MangaTest use its normal import matching rules.

## Manual QA

1. Start `npm run dev -w apps/web`.
2. Set a metadata import token in Admin > 设置 > 安全设置.
3. Load `apps/extension` as an unpacked extension in Chrome.
4. Open an ExHentai gallery detail page, or serve `test-fixtures/exhentai-gallery.html` from a local static server.
5. Click "采集预览" and confirm the title, tag count, resource count, adapter, and import status.
6. Open the matching torrent page, click "采集预览", and confirm torrent resources are detected.
7. Click "提交入库".
8. Confirm Admin > 漫画管理 shows a remote-only record or the chosen matched local record.

## Verification

```bash
npm run check
```

The content script is assembled from independent layers:

- `src/runtime/` detects the current page and normalizes collected facts.
- `src/backend/` owns the generic HTTP bridge to MangaTest.
- `src/features/` owns metadata and download-resource submission flows.
- `src/adapters/` owns site-specific URL matching, page handlers, DOM selectors, and resource extraction.
- `src/content/injector.js` only renders the common controls and orchestrates capabilities returned by the current adapter.

The first adapters are ExHentai (`src/adapters/exhentai/adapter.js`) and NHentai (`src/adapters/nhentai/adapter.js`). ExHentai keeps separate detail and torrent-page handlers while sharing the generic backend and submission flows.

For ExHentai, `.torrent` URLs are not sent to MangaTest when conversion succeeds. The extension submits generated magnet links instead.
