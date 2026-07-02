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
- `tags` owns canonical tags, translations, aliases, and tag display text.
- `reader` owns page data, page image access, reading progress, and vertical reader behavior.
- `metadata-ingest` owns browser-plugin submissions and source metadata normalization.
- `downloads` owns download tasks and provider orchestration.
- OpenList, builtin HTTP download, and aria2 are provider adapters inside `downloads`.
- `admin` is a management UI and orchestration layer; it should not own core business rules.
- `search` can start as simple database queries and later become its own module.
- `apps/extension` is an independent app and communicates with `apps/web` only through HTTP APIs.

## Current Phase

- The visual and interactive prototype is being finalized in `apps/prototype`.
- Next real implementation target is `apps/web` MVP.
- MVP starts with local library: manga root settings, directory/zip/cbz scanning, comic list, detail page, reader, reading progress, basic tags, search, and file maintenance.
- Do not implement browser extension, OpenList, 115, aria2, magnet download, or cloud scanning during MVP phase unless the user explicitly changes the plan.

## Tech Decisions

- Final web app stack: Next.js App Router, TypeScript, SQLite, Drizzle ORM, Tailwind CSS, shadcn/ui, lucide-react, Vitest, Playwright, Sharp, and a zip/cbz reader such as `yauzl` or `unzipper`.
- The final app is local self-hosted software, not a serverless/Vercel-first deployment.
- Chrome extension targets Manifest V3 first.
- MVP supports local directories, `.zip`, and `.cbz` only.
- Manga root is configured as an absolute path.

## Prototype Rules

- `apps/prototype` may use mock data and fake state.
- Keep prototype-only fake data out of `apps/web`.
- Prototype pages should validate layout, density, navigation shape, reader feel, admin workflow, and responsive behavior.
- Do not build real database, file scanning, OpenList, aria2, or browser extension logic in prototype code.

## Design Rules

- The public-facing experience should feel like a normal manga website first.
- Admin and file-maintenance features are secondary and should not dominate the homepage.
- Prefer calm, readable manga-site layouts over decorative landing-page style or operations-heavy dashboards.
- Avoid unnecessary gradients, glow effects, floating decoration, and oversized hero sections.
- Reader UI should stay quiet and not compete with comic pages.
- Use realistic mock data in prototypes so layout pressure is visible early.
- Use icons for compact actions where appropriate; avoid emoji as UI icons.
- Keep card radius modest and avoid nested cards.
- Use semantic tokens and CSS variables for colors and surfaces.

## Data And Safety

- Do not commit real tokens, cookies, OpenList credentials, magnet links, or private source URLs.
- Logs must not include full magnet links.
- Mock paths and mock metadata are allowed in prototypes.
- Source URLs and local paths may be shown in the app when needed for local management.
- Deleting a comic record must not imply deleting real local files.
- Physical file deletion must be a separate, explicit, confirmed operation showing absolute paths.

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
