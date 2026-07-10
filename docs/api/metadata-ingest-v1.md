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
  "originalTitle": "Sample Original Comic"
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
  "originalTitle": "Sample Original Comic",
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

## Security Rules

- Do not send cookies, source-site authorization headers, or private account data.
- Magnet URLs may be submitted as resources, but logs and normal UI must not show them unredacted.
- ExHentai `.torrent` URLs should be converted to magnet links in the extension before submit when possible, so private torrent URLs do not need to be stored.
- `display_title` on existing comics is user-owned and must not be overwritten by metadata imports.
- `comicId` is optional and should only be sent by the extension after the user explicitly chooses a single local match.
