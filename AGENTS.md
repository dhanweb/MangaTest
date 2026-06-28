# AGENTS.md

## Project Structure

- `apps/web` is the final Next.js full-stack application.
- `apps/extension` is the Chrome Manifest V3 browser extension.
- `apps/prototype` is the interactive Next.js prototype with mock data.
- `prototypes/visual-html` is the static HTML/CSS visual prototype.
- `packages/ui` is for shared UI components after designs stabilize.
- `packages/shared` is for shared types, constants, and utilities.
- `packages/mock-data` is for mock data used by prototypes.
- `docs/plan.md` is the current source of truth for product and architecture decisions.

## Current Phase

- Start with `prototypes/visual-html`.
- The first prototype validates layout, color, density, navigation shape, and reader feel.
- Do not build real database, file scanning, OpenList, aria2, or browser extension logic during the visual prototype phase.
- After the visual direction is accepted, build `apps/prototype` for key interactions with mock data.
- Keep prototype-only fake data and fake state out of `apps/web`.

## Tech Decisions

- The interactive prototype and final web app use Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, and lucide-react for UI work.
- The final web app also uses SQLite, Drizzle ORM, Vitest, Playwright, Sharp, and a zip/cbz reader such as `yauzl` or `unzipper`.
- The final app is local self-hosted software, not a serverless/Vercel-first deployment.
- The Chrome extension targets Manifest V3 first.
- MVP supports local directories, `.zip`, and `.cbz` only.
- The manga root is configured as an absolute path.
- Configure shared Tailwind theme variables early, including primary pink, backgrounds, borders, muted text, card surfaces, and reader colors.

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
- Use shadcn/ui components first for reusable or stateful UI such as dialogs, alert dialogs, sheets, dropdown menus, select menus, tabs, popovers, tooltips, switches, inputs, tables, badges, and cards.
- Avoid over-wrapping shadcn components. Prefer direct composition and thin domain components only when they remove repeated manga-specific structure.
- Use Tailwind semantic tokens and CSS variables for colors and surfaces instead of page-local hardcoded color values.

## Product Boundaries

- Import and download are separate workflows.
- Local scanning can create a complete manga before browser metadata exists.
- Browser metadata can later enrich an existing local manga.
- Download providers such as OpenList, builtin HTTP download, and aria2 are future resource acquisition mechanisms, not the source of business truth.
- `comic` is the logical library item; `local_file` is a disk entity; `chapter` and `page` are reader entities.

## Data And Safety

- Do not commit real tokens, cookies, OpenList credentials, magnet links, or private source URLs.
- Use mock paths and mock metadata in prototypes.
- Logs should not include full magnet links.
- Source URLs and local paths may be shown in the app when needed for local management.
- Deleting a comic record must not imply deleting real local files unless explicitly specified.
- Physical file deletion must be a separate, explicit, confirmed operation.

## Development Practices

- Follow `docs/plan.md` unless the user explicitly updates the plan.
- Prefer small, focused files and clear module boundaries.
- Do not move prototype code into `apps/web` until its interaction model is accepted.
- Do not add production dependencies casually; prefer the planned stack unless there is a clear reason.
- Preserve unrelated user changes in the worktree.

## Verification

- For document-only changes, run `git diff --check`.
- For frontend/prototype work, verify desktop and mobile layouts.
- For interactive prototypes, verify the core mock flows manually in a browser.
- Before claiming completion, state what was checked and any remaining gaps.
