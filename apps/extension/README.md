# MangaTest Chrome Extension

Chrome Manifest V3 extension for submitting manga detail-page metadata to the local MangaTest web app.

## Development

Load `apps/extension` as an unpacked extension in Chrome.

Before submitting metadata:

1. Start `apps/web` at `http://127.0.0.1:4317`.
2. Open MangaTest admin settings and set a metadata import token.
3. Open a manga detail page in Chrome.
4. Open the extension popup, enter the local service URL and token, collect a preview, review the import status, then submit.

When the status panel shows a single local match, enable "提交到本地漫画" only if the detected page is the same comic. Leaving it unchecked lets MangaTest use its normal import matching rules.

## Manual QA

1. Start `npm run dev -w apps/web`.
2. Set a metadata import token in Admin > 设置 > 安全设置.
3. Load `apps/extension` as an unpacked extension in Chrome.
4. Open a manga detail page, or serve `test-fixtures/generic-gallery.html` from a local static server.
5. Click "采集预览" and confirm the title, tag count, resource count, adapter, and import status.
6. Click "提交入库".
7. Confirm Admin > 漫画管理 shows a remote-only record or the chosen matched local record.

## Verification

```bash
npm run check
```

The extension loads site-specific adapters from `src/content/site-adapters.js` before falling back to the generic detail-page collector.
