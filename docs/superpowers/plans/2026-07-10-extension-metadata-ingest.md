# Extension Metadata Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first post-MVP closed loop where a Chrome MV3 extension collects one manga detail page, checks MangaTest import status, submits metadata/resources, and the web app persists or matches the comic safely.

**Architecture:** Keep `apps/extension` as a no-build Manifest V3 app that talks to `apps/web` only through HTTP APIs. Keep normalization, matching, token validation, and database writes inside `modules/metadata-ingest`; the extension only collects page facts and displays status. Downloads remains a downstream consumer of `comic_resources`, not part of this first loop.

**Tech Stack:** Next.js App Router Route Handlers, TypeScript, SQLite/Drizzle, Vitest, Chrome Manifest V3, plain browser JavaScript, Node static checks.

## Global Constraints

- `docs/plan.md` remains the source of truth; if scope changes, update it first.
- Do not implement OpenList/115/aria2/magnet download execution in this plan.
- Do not store real tokens, cookies, private source URLs, or full magnet links in docs, tests, logs, or mock fixtures.
- Extension write APIs must require the configured metadata import token.
- User-edited display titles and manual tags must not be overwritten by metadata imports.
- Keep `apps/extension` dependency-free and build-free unless a later plan explicitly introduces a bundler.

---

## File Structure

- Modify `docs/plan.md`
  - Records that the active post-MVP target is the browser extension + Metadata Ingest loop.
- Create `docs/api/metadata-ingest-v1.md`
  - Human-readable API contract for `/api/metadata/status` and `/api/metadata/import`.
- Create `apps/web/src/modules/metadata-ingest/import-metadata.test.ts`
  - Backend integration tests for remote-only creation, local title matching, duplicate source updates, token-protected route behavior where practical.
- Modify `apps/web/src/modules/metadata-ingest/import-metadata.ts`
  - Add any missing validation or response fields exposed by tests.
- Create `apps/extension/src/content/metadata-contract.js`
  - Runtime-safe payload normalization used by popup before submit.
- Modify `apps/extension/src/content/collect-page-metadata.js`
  - Calls contract normalization before returning collected metadata.
- Modify `apps/extension/src/content/site-adapters.js`
  - Adds source-specific resource extraction only where page structure is known.
- Create `apps/extension/test-fixtures/nhentai-gallery.html`
  - Sanitized no-real-content HTML fixture for adapter checks.
- Create `apps/extension/test-fixtures/generic-gallery.html`
  - Sanitized generic HTML fixture for fallback collector checks.
- Modify `apps/extension/scripts/check-extension.mjs`
  - Verifies manifest files, syntax, and fixture-based collector output.
- Modify `apps/extension/src/popup/popup.html`
  - Adds visible local-match details and optional explicit import target.
- Modify `apps/extension/src/popup/popup.js`
  - Shows local match, sends `comicId` only when user chooses a single match, improves token/server errors.
- Modify `apps/extension/src/popup/popup.css`
  - Styles the match/status details.
- Modify `apps/extension/README.md`
  - Adds unpacked-extension development and manual QA steps.

## Task 1: Contract And Backend Ingest Tests

**Files:**
- Create: `docs/api/metadata-ingest-v1.md`
- Create: `apps/web/src/modules/metadata-ingest/import-metadata.test.ts`
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes:
  - `importMetadataPayload(input: MetadataIngestPayload): Promise<MetadataImportResult>`
  - `checkMetadataSourceStatus(input: MetadataSourceStatusInput): Promise<MetadataSourceStatusResult>`
- Produces:
  - Documented v1 request/response examples.
  - Tests proving import creates remote-only records, matches local titles, deduplicates source/resources, and does not overwrite user display title.

- [ ] **Step 1: Document the v1 contract**

Create `docs/api/metadata-ingest-v1.md` with:

```markdown
# Metadata Ingest API v1

Base URL defaults to `http://127.0.0.1:4317`.

All requests must include either:

```http
Authorization: Bearer <metadataImportToken>
```

or:

```http
x-mangatest-import-token: <metadataImportToken>
```

## POST /api/metadata/status

Request:

```json
{
  "site": "example.test",
  "sourceId": "example.test/gallery/123",
  "sourceUrl": "https://example.test/gallery/123",
  "title": "Sample Comic",
  "originalTitle": "サンプル Comic"
}
```

Success response:

```json
{
  "result": {
    "imported": false,
    "matchedBy": null,
    "comicId": null,
    "comicStatus": null,
    "displayTitle": null,
    "sourceRecordId": null,
    "hasLocalFile": false,
    "isPrimaryFileMissing": false,
    "localReadable": false,
    "resourceCount": 0,
    "localMatchComicId": null,
    "localMatchDisplayTitle": null,
    "localMatchStatus": null,
    "localMatchReadable": false,
    "localMatchCandidateCount": 0
  }
}
```

## POST /api/metadata/import

Request:

```json
{
  "comicId": null,
  "site": "example.test",
  "sourceId": "example.test/gallery/123",
  "sourceUrl": "https://example.test/gallery/123",
  "title": "Sample Comic",
  "originalTitle": "サンプル Comic",
  "coverUrl": "https://example.test/cover.jpg",
  "tags": [
    { "namespace": "artist", "name": "sample artist" },
    { "namespace": "language", "name": "translated" }
  ],
  "resources": [
    { "type": "http", "url": "https://example.test/download/sample.cbz", "label": "CBZ" }
  ]
}
```

Success response:

```json
{
  "result": {
    "comicId": "uuid",
    "comicStatus": "remote_only",
    "sourceRecordId": "uuid",
    "matchedBy": "created_remote",
    "createdComic": true,
    "tagCount": 2,
    "resourceCount": 1,
    "localReadable": false
  }
}
```

Security rules:

- Do not send cookies, authorization headers from source sites, or private user account data.
- Magnet URLs are allowed in the request but must never appear in logs or normal UI unredacted.
- `display_title` on existing comics is user-owned and must not be overwritten by metadata imports.
```

- [ ] **Step 2: Write backend integration tests**

Create `apps/web/src/modules/metadata-ingest/import-metadata.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("metadata ingest", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
  });

  it("creates a remote-only comic with source, tags, and redacted resources", async () => {
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = path.join(os.tmpdir(), `mangatest-metadata-${randomUUID()}.sqlite`);

    const { comicResources, comicSources, comics, getDb } = await import("../core/db");
    const { importMetadataPayload } = await import("./import-metadata");

    const result = await importMetadataPayload({
      site: "Example.Test",
      sourceId: "example.test/gallery/123",
      sourceUrl: "https://example.test/gallery/123",
      title: "Sample Comic",
      originalTitle: "サンプル Comic",
      coverUrl: "https://example.test/cover.jpg",
      tags: [
        { namespace: "artist", name: "Sample Artist" },
        { namespace: "artist", name: "sample artist" },
        { namespace: "language", name: "Translated" },
      ],
      resources: [
        { type: "magnet", url: "magnet:?xt=urn:btih:abcdef1234567890&dn=private", label: "Magnet" },
        { type: "http", url: "https://example.test/download/sample.cbz?token=private", label: "CBZ" },
      ],
    });

    const db = getDb();
    const comic = db.select().from(comics).where(eq(comics.id, result.comicId)).get();
    const source = db.select().from(comicSources).where(eq(comicSources.id, result.sourceRecordId)).get();
    const resources = db.select().from(comicResources).where(eq(comicResources.comicId, result.comicId)).all();

    expect(result).toMatchObject({
      comicStatus: "remote_only",
      createdComic: true,
      matchedBy: "created_remote",
      resourceCount: 2,
      tagCount: 2,
    });
    expect(comic?.displayTitle).toBe("Sample Comic");
    expect(source?.site).toBe("example.test");
    expect(resources.map((resource) => resource.redactedResource).join(" ")).not.toContain("private");
  });

  it("matches a single local title without overwriting the user display title", async () => {
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = path.join(os.tmpdir(), `mangatest-metadata-match-${randomUUID()}.sqlite`);

    const { comics, getDb } = await import("../core/db");
    const { normalizeSortTitle } = await import("../library/title-utils");
    const { checkMetadataSourceStatus, importMetadataPayload } = await import("./import-metadata");
    const comicId = randomUUID();

    getDb()
      .insert(comics)
      .values({
        id: comicId,
        displayTitle: "My Edited Title",
        fileTitle: "Sample Comic",
        sortTitle: normalizeSortTitle("Sample Comic"),
        status: "readable",
      })
      .run();

    const status = await checkMetadataSourceStatus({
      site: "example.test",
      sourceId: "example.test/gallery/123",
      sourceUrl: "https://example.test/gallery/123",
      title: "Sample Comic",
    });
    const result = await importMetadataPayload({
      site: "example.test",
      sourceId: "example.test/gallery/123",
      sourceUrl: "https://example.test/gallery/123",
      title: "Sample Comic",
      originalTitle: "サンプル Comic",
    });
    const row = getDb().select().from(comics).where(eq(comics.id, comicId)).get();

    expect(status.localMatchComicId).toBe(comicId);
    expect(result).toMatchObject({ comicId, createdComic: false, matchedBy: "local_title" });
    expect(row?.displayTitle).toBe("My Edited Title");
    expect(row?.originalTitle).toBe("サンプル Comic");
  });
});
```

- [ ] **Step 3: Fix imports in the test**

Add this import at the top of the test:

```ts
import { eq } from "drizzle-orm";
```

- [ ] **Step 4: Update `docs/plan.md` current state**

Append one bullet under the current stabilization list:

```markdown
- 后续阶段启动点：优先打通 Chrome MV3 插件采集详情页 metadata、状态查询、提交入库和 remote-only / 本地匹配闭环
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -w apps/web -- metadata-ingest
```

Expected: metadata ingest tests pass.

## Task 2: Extension Collector Contract Checks

**Files:**
- Create: `apps/extension/src/content/metadata-contract.js`
- Create: `apps/extension/test-fixtures/generic-gallery.html`
- Create: `apps/extension/test-fixtures/nhentai-gallery.html`
- Modify: `apps/extension/src/content/collect-page-metadata.js`
- Modify: `apps/extension/scripts/check-extension.mjs`

**Interfaces:**
- Consumes:
  - Browser page DOM.
  - `window.MangaTestSiteAdapters`.
- Produces:
  - `window.MangaTestMetadataContract.normalizeMetadataPayload(input)`.
  - Static fixture checks in `npm run check -w apps/extension`.

- [ ] **Step 1: Create runtime contract helper**

Create `apps/extension/src/content/metadata-contract.js`:

```js
(() => {
  const RESOURCE_TYPES = new Set(["magnet", "torrent", "http", "openlist"]);

  function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function normalizeUrl(value, baseUrl) {
    const text = cleanText(value);
    if (!text) return null;
    try {
      const url = new URL(text, baseUrl);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function normalizeMetadataPayload(input, baseUrl = location.href) {
    if (!input || typeof input !== "object") {
      throw new Error("页面没有返回可用 metadata。");
    }

    const sourceUrl = normalizeUrl(input.sourceUrl, baseUrl);
    const title = cleanText(input.title);
    const site = cleanText(input.site).toLowerCase();

    if (!site || !sourceUrl || !title) {
      throw new Error("metadata 缺少站点、来源 URL 或标题。");
    }

    const tags = [];
    const seenTags = new Set();
    for (const tag of Array.isArray(input.tags) ? input.tags : []) {
      const namespace = cleanText(tag?.namespace).toLowerCase();
      const name = cleanText(tag?.name).toLowerCase();
      const key = `${namespace}:${name}`;
      if (namespace && name && !seenTags.has(key)) {
        seenTags.add(key);
        tags.push({ namespace, name });
      }
    }

    const resources = [];
    const seenResources = new Set();
    for (const resource of Array.isArray(input.resources) ? input.resources : []) {
      const type = cleanText(resource?.type).toLowerCase();
      const url = type === "magnet" ? cleanText(resource?.url) : normalizeUrl(resource?.url, baseUrl);
      const key = `${type}:${url}`;
      if (RESOURCE_TYPES.has(type) && url && !seenResources.has(key)) {
        seenResources.add(key);
        resources.push({ type, url, label: cleanText(resource?.label) || type });
      }
    }

    return {
      adapterId: cleanText(input.adapterId) || "generic",
      site,
      sourceId: cleanText(input.sourceId) || null,
      sourceUrl,
      title,
      originalTitle: cleanText(input.originalTitle) || null,
      coverUrl: normalizeUrl(input.coverUrl, baseUrl),
      tags: tags.slice(0, 80),
      resources: resources.slice(0, 16),
    };
  }

  window.MangaTestMetadataContract = { normalizeMetadataPayload };
})();
```

- [ ] **Step 2: Call the contract helper from the collector**

Modify the end of `apps/extension/src/content/collect-page-metadata.js`:

```js
  const metadata = collectPageMetadata();
  return window.MangaTestMetadataContract ? window.MangaTestMetadataContract.normalizeMetadataPayload(metadata) : metadata;
})();
```

- [ ] **Step 3: Include the helper before collector injection**

Modify `apps/extension/src/popup/popup.js` script injection:

```js
files: ["src/content/site-adapters.js", "src/content/metadata-contract.js", "src/content/collect-page-metadata.js"],
```

- [ ] **Step 4: Add sanitized fixtures**

Create `apps/extension/test-fixtures/generic-gallery.html`:

```html
<!doctype html>
<html>
  <head>
    <link rel="canonical" href="https://example.test/gallery/123" />
    <meta property="og:title" content="Generic Sample Comic" />
    <meta property="og:image" content="https://example.test/cover.jpg" />
    <meta name="keywords" content="artist: sample artist, translated" />
  </head>
  <body>
    <h1>Generic Sample Comic</h1>
    <a href="https://example.test/download/sample.cbz">Download CBZ</a>
  </body>
</html>
```

Create `apps/extension/test-fixtures/nhentai-gallery.html`:

```html
<!doctype html>
<html>
  <head>
    <link rel="canonical" href="https://nhentai.net/g/123/" />
  </head>
  <body>
    <section id="info">
      <h1>NH Sample Comic</h1>
      <h2>サンプル</h2>
    </section>
    <section id="cover"><img src="https://t.nhentai.net/galleries/1/cover.jpg" /></section>
    <section id="tags">
      <div class="tag-container">Artists: <a class="tag"><span class="name">Sample Artist</span></a></div>
      <div class="tag-container">Languages: <a class="tag"><span class="name">English</span></a></div>
    </section>
  </body>
</html>
```

- [ ] **Step 5: Extend extension checker**

Modify `apps/extension/scripts/check-extension.mjs` to require `metadata-contract.js`, verify manifest references it through popup injection, and assert fixtures contain expected titles/resources using a lightweight VM harness.

- [ ] **Step 6: Run extension check**

Run:

```bash
npm run check -w apps/extension
```

Expected: manifest check and syntax checks pass.

## Task 3: Popup Status And Explicit Local Match UX

**Files:**
- Modify: `apps/extension/src/popup/popup.html`
- Modify: `apps/extension/src/popup/popup.css`
- Modify: `apps/extension/src/popup/popup.js`
- Modify: `apps/extension/README.md`

**Interfaces:**
- Consumes:
  - `MetadataSourceStatusResult.localMatchComicId`
  - `MetadataSourceStatusResult.localMatchDisplayTitle`
  - `MetadataSourceStatusResult.localMatchCandidateCount`
- Produces:
  - Popup user can see the single local match and choose whether to submit to it.
  - Popup sends `comicId` only after an explicit checked option.

- [ ] **Step 1: Add match preview markup**

In `popup.html`, add inside `#preview` after the `dl`:

```html
<label id="match-target" hidden>
  <input id="use-local-match" type="checkbox" />
  <span id="match-target-label">匹配本地漫画</span>
</label>
```

- [ ] **Step 2: Wire popup elements**

In `popup.js`, add:

```js
matchTarget: document.querySelector("#match-target"),
matchTargetLabel: document.querySelector("#match-target-label"),
useLocalMatch: document.querySelector("#use-local-match"),
```

- [ ] **Step 3: Render local match status**

Update `renderImportStatus(status)` so a single local match shows the checkbox and label:

```js
elements.matchTarget.hidden = true;
elements.useLocalMatch.checked = false;

if (!status?.imported && status?.localMatchComicId) {
  elements.matchTarget.hidden = false;
  elements.matchTargetLabel.textContent = `提交到本地漫画：${status.localMatchDisplayTitle || status.localMatchComicId}`;
  elements.previewImportStatus.textContent = status.localMatchReadable ? "可匹配本地" : "可匹配缺失记录";
  return;
}
```

- [ ] **Step 4: Submit explicit target**

Before POST `/api/metadata/import`, compute:

```js
const payload = {
  ...collectedMetadata,
  comicId: elements.useLocalMatch.checked && latestMetadataStatus?.localMatchComicId ? latestMetadataStatus.localMatchComicId : undefined,
};
```

Use `payload` as the request body.

- [ ] **Step 5: Style the match row**

Add to `popup.css`:

```css
#match-target {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border-top: 1px solid #fde0eb;
  padding-top: 8px;
}

#match-target input {
  width: 16px;
  min-height: 16px;
}
```

- [ ] **Step 6: Update README manual QA**

Add a section saying:

```markdown
When the status panel shows a single local match, enable "提交到本地漫画" only if the detected page is the same comic. Leaving it unchecked lets MangaTest use its normal import matching rules.
```

## Task 4: Backend Ingest Hardening

**Files:**
- Modify: `apps/web/src/modules/metadata-ingest/import-metadata.ts`
- Modify: `apps/web/src/modules/metadata-ingest/import-metadata.test.ts`
- Modify: `apps/web/src/app/api/metadata/import/route.ts`
- Modify: `apps/web/src/app/api/metadata/status/route.ts`

**Interfaces:**
- Consumes:
  - Payloads from Task 2 and Task 3.
- Produces:
  - Stable error messages for popup.
  - No full magnet/private URLs in returned JSON.
  - Existing user display title/manual tags remain user-owned.

- [ ] **Step 1: Add duplicate source update test**

Add a test importing the same `site + sourceId` twice with changed resource labels and assert:

```ts
expect(first.comicId).toBe(second.comicId);
expect(second.createdComic).toBe(false);
expect(second.matchedBy).toBe("source");
```

- [ ] **Step 2: Add explicit comicId test**

Add a test with an existing local comic and payload containing `comicId`, assert:

```ts
expect(result.matchedBy).toBe("comic_id");
expect(result.comicId).toBe(comicId);
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
npm run test -w apps/web -- metadata-ingest
```

Expected: pass.

## Task 5: End-To-End Manual QA And Release Notes

**Files:**
- Modify: `apps/extension/README.md`
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes:
  - Completed Tasks 1-4.
- Produces:
  - Manual QA checklist for loading the extension and importing one page.
  - Updated development state.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run lint -w apps/web
npm run typecheck -w apps/web
npm run test -w apps/web
npm run build -w apps/web
npm run check -w apps/extension
git diff --check
```

Expected:
- Web checks pass.
- Extension check passes.
- Build may keep the known Turbopack NFT warning unrelated to this plan.

- [ ] **Step 2: Browser/manual QA**

Manual steps:

1. Start `npm run dev -w apps/web`.
2. Set a metadata import token in Admin > 设置 > 安全设置.
3. Load `apps/extension` unpacked in Chrome.
4. Open `apps/extension/test-fixtures/generic-gallery.html` through a local static file or fixture host.
5. Collect preview.
6. Confirm title, tag count, resource count, adapter, and import status.
7. Submit.
8. Confirm Admin > 漫画管理 shows a remote-only or matched record.

## Self-Review

- Spec coverage: Third-stage extension + Metadata Ingest loop is covered; Downloads execution is intentionally excluded.
- Placeholder scan: No task uses TBD/TODO/fill in details.
- Type consistency: Payload names match `MetadataIngestPayload`, `MetadataImportResult`, and `MetadataSourceStatusResult`.
