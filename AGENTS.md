# AGENTS.md

## Source Of Truth

- `docs/plan.md` is the source of truth for product scope, architecture, module boundaries, and development phases.
- If implementation pressure conflicts with `docs/plan.md`, update the plan first or ask the user.

## Project Structure

- `apps/web` is the final local self-hosted Next.js full-stack application.
- `apps/extension` is the Chrome Manifest V3 browser extension.
- `apps/prototype` is the interactive Next.js prototype with mock data.
- `packages/shared` is for cross-app types, API contracts, tag helpers, and small pure utilities.
- `packages/ui` is for shared UI components after designs stabilize.
- `packages/mock-data` is for mock data used by prototypes.
- `scripts` is for development, maintenance, and one-off local tasks.
- `docs/plan.md` documents the modular architecture and phase plan.

## Architecture Rules

- Follow a NestJS-like modular mindset without introducing NestJS unless the user explicitly changes the stack.
- Keep domain modules independent and focused.
- Do not let Next.js pages or Route Handlers become the place where business rules live.
- Prefer this dependency flow:

```text
route / page / component
  -> module application service
  -> domain rule or repository port
  -> infrastructure adapter
```

- Shared infrastructure belongs in `modules/core`.
- Database, filesystem, OpenList, and provider calls should be hidden behind module services or adapters.
- Modules communicate through explicit services, ports, commands, or events.

## Module Boundaries

- `library` owns local manga catalog behavior: scanning configured roots, creating comics/chapters/pages, listing, detail data, and local display status.
- `local-files` owns filesystem facts: paths, missing files, file changes, cover generation, path repair, and physical file safety.
- `media-assets` owns generated image assets: covers, list thumbnails, reader page thumbnails, cache invalidation, and regeneration.
- `tags` owns canonical tags, translations, aliases, and tag display text.
- `reader` owns page data, page image access, reading progress, and vertical reader behavior.
- `metadata-ingest` owns browser-plugin submissions and source metadata normalization.
- `downloads` owns download tasks and provider orchestration.
- OpenList, builtin HTTP download, and aria2 are provider adapters inside `downloads`.
- `admin` is a management UI and orchestration layer; it should not own core business rules.
- `search` can start as simple database queries and later become its own module.
- `collections` is reserved for favorites, reading queues, category reading, and auto-next flows after MVP.
- `apps/extension` is an independent app and communicates with `apps/web` only through HTTP APIs.

## Product Decisions

- MVP supports multiple configured manga roots, but only implements the default scan mode where each child directory or archive is treated as a comic.
- A comic may have multiple `local_file` records; reader uses the primary local file unless the user changes it in admin.
- Merging one comic into another as a chapter must be reversible and must not move physical files.
- Authors are tags, such as `artist:*` and `group:*`; do not introduce a separate author table unless the plan changes.
- Public site pages show only local readable comics by default. Missing, hidden, remote-only, and unreadable records belong in admin views.
- User-edited display titles and tags must not be overwritten by later metadata imports.
- Reader progress is tracked by `comic + chapter + page`, with a comic-level last-read snapshot.
- Route/page image APIs must read by `pageId`; do not accept arbitrary filesystem paths from the client.
- Zip/cbz files are not fully extracted by default. Cache file lists first, then extract requested images on demand.
- Reader thumbnails are generated lazily around the current page and visible window. Use fixed-size placeholders, cache hits should appear immediately, misses should enqueue background generation.
- Thumbnail cache keys must include image path or sha, requested size, and usage type.
- Generated-image and archive caches track `lastAccess` and are cleaned by both size limit and expiration time.
- Background generation must use a queue to avoid unbounded concurrency while scrolling.

## Directory Rules

- Prefer `apps/web/src/app/(site)` for public manga website routes.
- Prefer `apps/web/src/app/admin` for admin routes.
- Prefer `apps/web/src/app/api` for Route Handlers that call module services.
- Do not create a top-level `comic` module unless the plan is changed; `comic` is the central entity and `library` owns the local catalog behavior.
- Do not name the browser-plugin ingestion module `import`; use `metadata-ingest` to avoid confusion with local file scanning.
- Do not create a top-level `openlist` module; keep OpenList under `modules/downloads/providers/openlist`.
- Use `modules/media-assets` instead of a narrow `thumbnail` module when generated images include both covers and reader thumbnails.
- `workers` may host long-running task entrypoints, but business rules still belong in module services.
- Do not introduce `prisma/`; the planned ORM is Drizzle.
- Do not assume real manga files live under project `storage/manga`; the manga root is configured as an absolute path.

## Current Phase

- The visual and interactive prototype is being finalized in `apps/prototype`.
- Next real implementation target is `apps/web` MVP.
- MVP starts with local library: manga root settings, directory/zip/cbz scanning, comic list, detail page, reader, reading progress, basic tags, search, and file maintenance.
- Do not implement browser extension, OpenList, 115, aria2, magnet download, or cloud scanning during MVP phase unless the user explicitly changes the plan.
- Do not implement file watching, physical file deletion, multi-user accounts, startup auto-scan, or plugin list-page batch collection during MVP.

## Tech Decisions

- The interactive prototype and final web app use Next.js App Router, TypeScript, Tailwind CSS, Mantine, shadcn/ui, and lucide-react for UI work.
- `apps/prototype` is the dependency reference for prototype-validated UI patterns. When `apps/web` implements a matching page or workflow, install and use the same prototype UI dependencies when practical; current prototype UI dependencies include `@mantine/core` and `@mantine/hooks`.
- Mantine is the primary component library for pages and workflows that are copied from or visually matched to `apps/prototype`. shadcn/ui may remain for existing components or low-level primitives, but it must not be used to approximate a prototype page when the prototype already uses Mantine for that control or workflow.
- The final web app also uses SQLite, Drizzle ORM, Vitest, Playwright, Sharp, and a zip/cbz reader such as `yauzl` or `unzipper`.
- The final app is local self-hosted software, not a serverless/Vercel-first deployment.
- Chrome extension targets Manifest V3 first.
- MVP supports local directories, `.zip`, and `.cbz` only.
- The manga root is configured as an absolute path.
- The default listen host is `127.0.0.1`; if non-localhost listening is enabled later, write APIs require a token.
- Configure shared Tailwind theme variables early, including primary pink, backgrounds, borders, muted text, card surfaces, and reader colors.

## Prototype Rules

- `apps/prototype` may use mock data and fake state.
- Keep prototype-only fake data out of `apps/web`.
- Prototype pages should validate layout, density, navigation shape, reader feel, admin workflow, and responsive behavior.
- When implementing matching pages and workflows in `apps/web`, use `apps/prototype` as the primary reference for visual density, navigation structure, page layout, and interaction feel.
- When a prototype page uses Mantine wrappers such as `AppButton`, `AppInput`, `AppSelect`, `AppSwitch`, `AppModal`, or `AppTabs`, the matching `apps/web` page should use the same Mantine-based component approach unless there is a documented reason not to.
- Do not build real database, file scanning, OpenList, aria2, or browser extension logic in prototype code.

## Design Rules

- The public-facing experience should feel like a normal manga website first: browse, discover, open details, and read.
- Admin and file-maintenance features are secondary and should not dominate the default homepage or primary navigation.
- This is also a local library management system, but the visual prototype should not look like a pure management dashboard.
- Prefer calm, readable manga-site layouts over decorative landing-page style or operations-heavy dashboard style.
- Avoid unnecessary gradients, glow effects, floating decoration, and oversized hero sections.
- Reader UI should stay quiet and not compete with comic pages.
- Use realistic mock data in prototypes so layout pressure is visible early.
- Use icons for compact actions where appropriate; avoid emoji as UI icons.
- Keep card radius modest and avoid nested cards.
- Use Mantine first for reusable or stateful UI that already exists in the prototype, including buttons, inputs, selects, switches, modals, tabs, tables, and admin controls.
- Use shadcn/ui components only when they are already in place, when the prototype has no Mantine equivalent, or when a low-level primitive is a better fit. Do not let shadcn styling drift away from a Mantine-based prototype page.
- Avoid over-wrapping component libraries. Prefer the shared prototype-style `App*` wrappers only when they preserve visual parity or remove repeated manga-specific structure.
- Use Tailwind semantic tokens and CSS variables for colors and surfaces instead of page-local hardcoded color values.

## Product Boundaries

- Import and download are separate workflows.
- Local scanning can create a complete manga before browser metadata exists.
- Browser metadata can later enrich an existing local manga.
- Download providers such as OpenList, builtin HTTP download, and aria2 are future resource acquisition mechanisms, not the source of business truth.
- `comic` is the logical library item; `local_file` is a disk entity; `chapter` and `page` are reader entities.

## Data And Safety

- Do not commit real tokens, cookies, OpenList credentials, magnet links, or private source URLs.
- Logs must not include full magnet links.
- Mock paths and mock metadata are allowed in prototypes.
- Source URLs and local paths may be shown in the app when needed for local management.
- Deleting a comic record must not imply deleting real local files.
- Physical file deletion must be a separate, explicit, confirmed operation showing absolute paths.

## Browser Extension (`apps/extension`)

- Load the extension for development as **unpacked** from `apps/extension` (not only from a zip). Chrome reads `manifest.json` and `src/**` directly.
- **Daily development does not require rebuild/repack.** After code changes: open `chrome://extensions` → click **Reload** on MangaTest → hard-refresh open ExHentai/e-hentai tabs (or close and reopen them). Content scripts and service worker do not update until reload.
- `npm run build -w apps/extension` only packages `dist/MangaTest-Extension-v{version}.zip` for distribution; it is optional for local unpacked loads.
- **Version bump is mandatory on every extension change.** When editing any file under `apps/extension/` (including docs/scripts that ship with the extension), bump the Chrome extension version before finishing the change:
  1. Bump `apps/extension/manifest.json` → `version` (semver: patch for fixes/behavior, minor for features).
  2. Keep `apps/extension/package.json` → `version` the same as `manifest.json`.
  3. Prefer showing the version in the extension popup UI so the user can confirm they loaded the latest build.
- Do not claim an extension change is done without a version bump when extension sources changed.
- After extension work, run `npm run check -w apps/extension` when feasible.

## Development Practices

- Prefer small, focused files and clear module boundaries.
- Add abstractions only when they encode a real module boundary or remove meaningful duplication.
- Do not add production dependencies casually.
- Preserve unrelated user changes in the worktree.
- For structured data, use typed APIs or parsers instead of ad hoc string manipulation.
- Keep module tests close to the module they verify.

## Verification

- For document-only changes, run `git diff --check`.
- For frontend/prototype work, run lint/build when feasible and verify core flows in a browser.
- For real implementation work, add targeted tests for module services and run the relevant test command.
- Before claiming completion, state what was checked and any remaining gaps.
