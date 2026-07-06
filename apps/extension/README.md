# MangaTest Chrome Extension

Chrome Manifest V3 extension for submitting manga detail-page metadata to the local MangaTest web app.

## Development

Load `apps/extension` as an unpacked extension in Chrome.

Before submitting metadata:

1. Start `apps/web` at `http://127.0.0.1:4317`.
2. Open MangaTest admin settings and set a metadata import token.
3. Open a manga detail page in Chrome.
4. Open the extension popup, enter the local service URL and token, collect a preview, review the import status, then submit.

## Verification

```bash
npm run check
```

The extension loads site-specific adapters from `src/content/site-adapters.js` before falling back to the generic detail-page collector.
