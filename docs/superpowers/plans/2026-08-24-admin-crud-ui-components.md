# Unified Admin CRUD and Application UI Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a typed Mantine-based admin list/table system and one application-wide modal, button, icon-button, and tag language, including a fixed modal header/footer and a search/filter/refresh toolbar on one desktop row.

**Architecture:** Global `App*` primitives own visual and accessibility behavior, `AdminDataTable<T>` owns tabular rendering and special columns, and `AdminCrudList` composes controlled toolbar/content/pagination regions. Pages retain all domain filtering, APIs, mutations, and persisted tab state.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Mantine 9, Tailwind/CSS variables, lucide-react, Vitest.

## Global Constraints

- `docs/plan.md` remains the source of truth; update it before implementation if the approved contract changes.
- Use Mantine first and do not add another component library or data-grid dependency.
- Do not move API calls, domain rules, filtering predicates, or mutations into shared presentation components.
- Preserve unrelated worktree changes and all current URLs, API contracts, business behavior, admin tab-state keys, and safety confirmations.
- Use semantic theme tokens; do not add page-local button/tag hover palettes.
- All application-owned modals use fixed header/footer and a body-only scroll region.
- All admin record tables use `AdminDataTable`; searchable/pageable record screens compose it through `AdminCrudList`.
- No extension files are in scope.

---

### Task 1: Add tested admin list-state utilities and contracts

**Files:**

- Create: `apps/web/src/components/admin-ui/admin-list-state.ts`
- Create: `apps/web/src/components/admin-ui/admin-list-state.test.ts`
- Create: `apps/web/src/components/admin-ui/types.ts`
- Modify: `docs/plan.md`

**Interfaces:**

- Produces: `clampPage(page, total, pageSize): number`
- Produces: `getRowNumber(rowIndex, page, pageSize): number`
- Produces: `getSelectablePageKeys`, `togglePageSelection`
- Produces: shared `AppTone`, `AppControlSize`, admin column/filter/pagination types

- [ ] **Step 1: Write the failing state-helper tests**

```ts
import { describe, expect, it } from "vitest";

import { clampPage, getRowNumber, getSelectablePageKeys, togglePageSelection } from "./admin-list-state";

describe("admin list state", () => {
  it("clamps a page after filtering or deletion", () => {
    expect(clampPage(4, 21, 10)).toBe(3);
    expect(clampPage(2, 0, 10)).toBe(1);
  });

  it("calculates sequence numbers across pages", () => {
    expect(getRowNumber(0, 3, 20)).toBe(41);
    expect(getRowNumber(19, 3, 20)).toBe(60);
  });

  it("selects enabled current-page rows without discarding another page", () => {
    const rows = [{ id: "a", disabled: false }, { id: "b", disabled: true }, { id: "c", disabled: false }];
    const pageKeys = getSelectablePageKeys(rows, (row) => row.id, (row) => !row.disabled);
    expect(pageKeys).toEqual(["a", "c"]);
    expect(togglePageSelection(new Set(["outside"]), pageKeys, true)).toEqual(new Set(["outside", "a", "c"]));
    expect(togglePageSelection(new Set(["outside", "a", "c"]), pageKeys, false)).toEqual(new Set(["outside"]));
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test -w apps/web -- admin-list-state.test.ts`

Expected: FAIL because `admin-list-state.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

```ts
export function clampPage(page: number, total: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return Math.min(Math.max(1, page), totalPages);
}

export function getRowNumber(rowIndex: number, page: number, pageSize: number) {
  return (Math.max(1, page) - 1) * Math.max(1, pageSize) + rowIndex + 1;
}

export function getSelectablePageKeys<T>(rows: readonly T[], getKey: (row: T) => string, isSelectable: (row: T) => boolean) {
  return rows.filter(isSelectable).map(getKey);
}

export function togglePageSelection(current: ReadonlySet<string>, pageKeys: readonly string[], selected: boolean) {
  const next = new Set(current);
  for (const key of pageKeys) selected ? next.add(key) : next.delete(key);
  return next;
}
```

- [ ] **Step 4: Add the exact shared type unions**

```ts
export type AppTone = "primary" | "neutral" | "success" | "warning" | "danger" | "info";
export type AppControlSize = "xs" | "sm" | "md" | "lg";
export type AppButtonVariant = "filled" | "light" | "outline" | "subtle" | "transparent";
```

- [ ] **Step 5: Run focused verification**

Run: `npm run test -w apps/web -- admin-list-state.test.ts`

Expected: PASS.

Run: `npm run typecheck -w apps/web`

Expected: PASS with no new TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add docs/plan.md apps/web/src/components/admin-ui
git commit -m "feat(web): define admin list UI contracts"
```

---

### Task 2: Build the typed button, icon-button, and tag primitives

**Files:**

- Create: `apps/web/src/components/ui/app-button.tsx`
- Create: `apps/web/src/components/ui/app-tag.tsx`
- Modify: `apps/web/src/components/ui/app-components.tsx`
- Modify: `apps/web/src/lib/theme.tsx`

**Interfaces:**

- Consumes: `AppTone`, `AppControlSize`, `AppButtonVariant`
- Produces: `AppButton`, `AppLinkButton`, `AppIconButton`, `AppTag`, `toneToMantineColor`

- [ ] **Step 1: Define one semantic color map**

```ts
export const toneToMantineColor: Record<AppTone, string> = {
  primary: "pink",
  neutral: "gray",
  success: "green",
  warning: "yellow",
  danger: "red",
  info: "blue",
};
```

- [ ] **Step 2: Replace permissive button props with a typed contract**

```ts
export type AppButtonStyleProps = {
  tone?: AppTone;
  variant?: AppButtonVariant;
  size?: AppControlSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export type AppButtonProps = Omit<ButtonProps, "color" | "variant" | "size" | "leftSection" | "rightSection"> & AppButtonStyleProps;

export function AppButton({ tone = "primary", variant = "filled", size = "sm", leftIcon, rightIcon, ...props }: AppButtonProps) {
  return <Button color={toneToMantineColor[tone]} variant={variant} size={size} leftSection={leftIcon} rightSection={rightIcon} {...props} />;
}
```

Add `AppLinkButton` in the same file. It accepts typed Next `Link` props plus the same semantic style props and renders `Button component={Link}`; feature call sites no longer pass `component={Link}` through `AppButton`.

- [ ] **Step 3: Add an accessible icon-button contract**

```ts
export type AppIconButtonProps = Omit<ActionIconProps, "aria-label" | "color" | "size" | "variant"> & {
  label: string;
  tooltip?: string;
  tone?: AppTone;
  size?: AppControlSize;
  variant?: Exclude<AppButtonVariant, "transparent">;
  children: ReactElement;
};
```

Render it through Mantine `Tooltip` + `ActionIcon`, always set `aria-label={label}`, and map `tone` through the same color map.

- [ ] **Step 4: Implement static and interactive tags**

```ts
export type AppTagProps = {
  children: ReactNode;
  tone?: AppTone;
  variant?: "soft" | "outline" | "filled";
  size?: "xs" | "sm" | "md";
  icon?: ReactNode;
  interactive?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
};
```

Map `soft` to Mantine `light`, keep non-interactive tags cursor-neutral, and render the remove control through `AppIconButton` with `removeLabel` required whenever `onRemove` exists.

- [ ] **Step 5: Preserve the public barrel during migration**

`app-components.tsx` must re-export the new components and typed props. Preserve `AppBadge` only as a deprecated alias of `AppTag` until all call sites migrate; remove the `any` index signatures immediately.

- [ ] **Step 6: Verify**

Run: `npm run lint -w apps/web`

Run: `npm run typecheck -w apps/web`

Expected: both PASS.

Manually render the 6 tones × applicable variants at pointer and keyboard focus, including loading/disabled states, then remove the temporary showcase.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui apps/web/src/lib/theme.tsx
git commit -m "feat(web): add unified button and tag primitives"
```

---

### Task 3: Build the fixed-header/body/footer modal and confirmation queue

**Files:**

- Create: `apps/web/src/components/ui/app-modal.tsx`
- Create: `apps/web/src/components/ui/app-confirm-dialog.tsx`
- Create: `apps/web/src/components/ui/app-confirm-state.ts`
- Create: `apps/web/src/components/ui/app-confirm-state.test.ts`
- Modify: `apps/web/src/components/ui/app-components.tsx`
- Modify: `apps/web/src/lib/theme.tsx`

**Interfaces:**

- Produces: `AppModal`, `AppModalFooter`, `AppConfirmProvider`, `useAppConfirm`

- [ ] **Step 1: Test confirmation queue transitions**

Cover queue append, confirm/cancel resolving only the head item, double resolution being ignored, and provider teardown resolving every pending promise as `false`.

Run: `npm run test -w apps/web -- app-confirm-state.test.ts`

Expected: FAIL until the reducer/state helpers exist.

- [ ] **Step 2: Implement the modal layout contract**

Apply these owned styles to `MantineModal.Content`, body, and footer:

```ts
const modalStyles = {
  content: {
    display: "flex",
    flexDirection: "column" as const,
    maxHeight: "calc(100dvh - 32px)",
    overflow: "hidden",
  },
  header: { flex: "0 0 auto", borderBottom: "1px solid var(--mantine-color-pink-1)" },
  body: { flex: "1 1 auto", minHeight: 0, overflowY: "auto" as const },
};

const footerStyle = {
  display: "flex",
  flex: "0 0 auto",
  flexWrap: "nowrap" as const,
  justifyContent: "flex-end",
  gap: "var(--mantine-spacing-sm)",
  overflowX: "auto" as const,
  borderTop: "1px solid var(--mantine-color-pink-1)",
};
```

Merge user `className`/supported slot props without allowing callers to replace the structural flex/overflow rules. Keep optional desktop dragging internal and reset/constrain position on close and viewport changes.

- [ ] **Step 3: Implement typed close guards and footer slots**

`preventClose` blocks Escape, overlay, and close-button dismissal while a destructive submit is loading. `footer` renders outside the scroll body. `description` is associated through Mantine's accessible modal primitives.

- [ ] **Step 4: Implement the confirmation provider**

```ts
export type ConfirmOptions = {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "warning" | "danger";
};

export type Confirm = (options: ConfirmOptions) => Promise<boolean>;
```

Mount `AppConfirmProvider` in `Providers`, resolve one queued request at a time, and render cancel/confirm with `AppButton` in the modal footer.

- [ ] **Step 5: Verify**

Run: `npm run test -w apps/web -- app-confirm-state.test.ts`

Expected: PASS.

Browser fixture matrix: 390×844, 768×1024, 1440×900. Confirm that title/footer remain visible, only body scrolls, actions remain one line, Tab/Shift+Tab are trapped, Escape/overlay honor `preventClose`, and focus returns to the trigger.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui apps/web/src/lib/theme.tsx
git commit -m "feat(web): add fixed-layout modal and confirmations"
```

---

### Task 4: Build `AdminDataTable` and `AdminCrudList`

**Files:**

- Create: `apps/web/src/components/admin-ui/admin-data-table.tsx`
- Create: `apps/web/src/components/admin-ui/admin-crud-list.tsx`
- Create: `apps/web/src/components/admin-ui/admin-page-header.tsx`
- Create: `apps/web/src/components/ui/empty-state.tsx`
- Create: `apps/web/src/components/ui/overflow-tooltip-text.tsx`

**Interfaces:**

- Consumes: Task 1 helpers/types, `AppButton`, `AppIconButton`, `AppInput`, `AppSelect`
- Produces: `AdminDataTable<T>`, `AdminCrudList`, `AdminPageHeader`, `AppEmptyState`, `OverflowTooltipText`

- [ ] **Step 1: Implement typed column and selection contracts**

```ts
export type AdminTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T, rowIndex: number) => ReactNode;
  width?: number | string;
  minWidth?: number | string;
  align?: "left" | "center" | "right";
  fixed?: "left" | "right";
  wrap?: boolean;
};

export type AdminTableSelection<T> = {
  selectedKeys: ReadonlySet<string>;
  onSelectedKeysChange: (keys: Set<string>) => void;
  isRowSelectable?: (row: T) => boolean;
  getCheckboxLabel: (row: T) => string;
};
```

- [ ] **Step 2: Implement special columns and sticky offsets**

Render selection first, page-aware sequence second, then declared columns. Require deterministic widths on fixed columns. Calculate right offsets from right to left. Sticky header/cells use opaque surfaces and a boundary shadow; action cells use `white-space: nowrap`.

- [ ] **Step 3: Implement table states**

Use Mantine table semantics, a native horizontal scroll container, a consistent pink-tinted header, striped/hover rows, skeleton loading cells, and `AppEmptyState` spanning the calculated total column count.

- [ ] **Step 4: Implement controlled list toolbar and pagination**

```ts
export type AdminCrudListProps = {
  search?: { value: string; onChange: (value: string) => void; placeholder: string; ariaLabel: string };
  filters?: readonly AdminListFilter[];
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  primaryActions?: ReactNode;
  batchActions?: ReactNode;
  pagination?: false | AdminListPagination;
  children: ReactNode;
};
```

Desktop toolbar order: growing search, filters, batch actions, refresh, primary actions. Use one wrapping container below tablet width, never the page header. Pagination renders total, page-size select `[10, 20, 50]`, and Mantine `Pagination` with edges.

- [ ] **Step 5: Verify**

Run: `npm run test -w apps/web -- admin-list-state.test.ts`

Run: `npm run lint -w apps/web`

Run: `npm run typecheck -w apps/web`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin-ui apps/web/src/components/ui
git commit -m "feat(web): add reusable admin data table and CRUD list"
```

---

### Task 5: Pilot the CRUD/table API on manga and video management

**Files:**

- Modify: `apps/web/src/app/admin/comics/comics-panel.tsx`
- Modify: `apps/web/src/app/admin/videos/videos-panel.tsx`

**Interfaces:**

- Consumes: `AdminPageHeader`, `AdminCrudList`, `AdminDataTable`, `AppButton`, `AppTag`, `AppModal`, `OverflowTooltipText`
- Produces: the reference usage for later admin migrations

- [ ] **Step 1: Move refresh into the toolbar**

Both pages render title/icon/description through `AdminPageHeader`. Pass `refreshActiveTab` to `AdminCrudList.onRefresh`; do not render refresh in `AdminPageHeader.actions`.

- [ ] **Step 2: Convert manga columns**

Declare cover, title, author, page count, status, and operation columns. Add `rowNumber={{ page, pageSize: limit }}` and set operation to `{ width: 86, fixed: "right", wrap: false }`. Keep `ComicCover`, previewability rules, exact search predicate, and `/admin/comics/${comic.id}` link.

- [ ] **Step 3: Convert video columns**

Declare cover, title, episode count, duration, status, and operation columns. Add the same sequence/fixed-operation behavior. Preserve the 20-row behavior, `formatDuration`, status predicate, and `/admin/videos/${video.id}` link.

- [ ] **Step 4: Standardize controlled pagination behavior**

Convert manga `pageSize` to a number at the `AdminCrudList` boundary, reset page to 1 when search/status/page size changes, and clamp both pages when result totals shrink. Preserve stored tab keys (`page`, `pageSize`, `statusFilter:v2`, video `search`, video `status`).

- [ ] **Step 5: Migrate the cover preview modal**

Use `AppModal` with `size="sm"`, no footer, and the same title/image content. Remove the direct Mantine `Modal` import.

- [ ] **Step 6: Verify the pilot before broad migration**

At 1440px, search + status + refresh are on one row. At 768px and 390px, controls remain readable and fixed actions do not cover data. Verify search/status reset page, row numbers span pages, pagination total/page size, cover preview, refresh, empty results, and links.

Run: `npm run lint -w apps/web`

Run: `npm run typecheck -w apps/web`

Run: `npm run test -w apps/web`

Run: `npm run build -w apps/web`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/comics/comics-panel.tsx apps/web/src/app/admin/videos/videos-panel.tsx
git commit -m "refactor(web): migrate comic and video admin lists"
```

---

### Task 6: Migrate every remaining admin table/list

**Files:**

- Modify: `apps/web/src/app/admin/tags/tags-panel.tsx`
- Modify: `apps/web/src/app/admin/paths/paths-panel.tsx`
- Modify: `apps/web/src/app/admin/paths/video-paths-panel.tsx`
- Modify: `apps/web/src/app/admin/files/files-panel.tsx`
- Modify: `apps/web/src/app/admin/collections/collections-panel.tsx`
- Modify: `apps/web/src/app/admin/downloads/downloads-panel.tsx`
- Modify: `apps/web/src/app/admin/pixiv-sync/pixiv-sync-panel.tsx`
- Modify: `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx`
- Modify: `apps/web/src/app/admin/videos/[id]/video-admin-detail-panel.tsx`

**Interfaces:**

- Consumes: pilot-approved admin UI components
- Produces: zero application-owned direct Mantine table usage under `app/admin`

- [ ] **Step 1: Migrate tags**

Use `AdminCrudList` for search/namespace filters/create/refresh as applicable; use `AdminDataTable` for canonical/display/usage/actions. Preserve namespace options, edit state, save/delete APIs, and exact empty text. Use fixed-right icon actions.

- [ ] **Step 2: Migrate manga and video paths**

Use the list shell for search/add controls and the data table for roots. Preserve server form actions, protected system/Pixiv root rules, counts, scan/open/delete behavior, absolute-path wrapping, and recent scan summary. Use a fixed-right operations group.

- [ ] **Step 3: Migrate file maintenance and collections**

Use `AdminDataTable` for missing/duplicate records and the custom-content slot for collection cards/event history where a table would reduce usability. Use controlled selection only in existing multi-record merge/selection flows; do not introduce new bulk deletion. Preserve API calls, toasts, and safety text.

- [ ] **Step 4: Migrate downloads and Pixiv sync**

Convert each task/resource/preview table independently. Preserve tabs, expansion rows, provider selection, task actions, polling/refresh, and preview semantics. Operational sub-tables use `AdminDataTable` directly without fake search/pagination controls.

- [ ] **Step 5: Migrate detail tables**

Convert comic chapters/local files/sources/logs and video episodes to `AdminDataTable`. Preserve inline ordering/title inputs, row actions, merge semantics, and empty states. Fixed-right operations apply where row actions exist.

- [ ] **Step 6: Audit and verify**

Run: `rg -n 'import .*\bTable\b.*from "@mantine/core"' apps/web/src/app/admin --glob '*.tsx'`

Expected: no application-owned record-table imports; any exception is documented with its non-record-table reason.

Run lint, typecheck, tests, and build after each large page and after the full wave. Browser-check every modified route at desktop/tablet/mobile widths.

- [ ] **Step 7: Commit in rollback-safe groups**

```bash
git commit -m "refactor(web): migrate admin catalog tables"
git commit -m "refactor(web): migrate admin operational tables"
git commit -m "refactor(web): migrate admin detail tables"
```

Stage only the files belonging to each group before its commit.

---

### Task 7: Migrate all application-owned modal and confirmation flows

**Files:**

- Modify: `apps/web/src/app/admin/settings/page.tsx`
- Modify: `apps/web/src/app/admin/tags/tags-panel.tsx`
- Modify: `apps/web/src/app/admin/files/files-panel.tsx`
- Modify: `apps/web/src/app/admin/paths/manga-root-dialog.tsx`
- Modify: `apps/web/src/app/admin/paths/manga-root-edit-dialog.tsx`
- Modify: `apps/web/src/app/admin/paths/system-root-path-dialog.tsx`
- Modify: `apps/web/src/app/admin/paths/paths-panel.tsx`
- Modify: `apps/web/src/app/admin/paths/video-paths-panel.tsx`
- Modify: `apps/web/src/app/admin/pixiv-sync/pixiv-sync-panel.tsx`
- Modify: `apps/web/src/app/admin/collections/collections-panel.tsx`
- Modify: `apps/web/src/app/admin/comics/comics-panel.tsx`
- Modify: `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx`
- Modify: `apps/web/src/app/admin/videos/[id]/video-admin-detail-panel.tsx`

**Interfaces:**

- Consumes: `AppModal`, `AppModalFooter`, `useAppConfirm`
- Produces: no direct application modal/native-confirm usage

- [ ] **Step 1: Move every modal action group into `footer`**

Use this exact shape and pass loading state into `preventClose`:

```tsx
<AppModal
  opened={opened}
  onClose={close}
  title={title}
  preventClose={isSaving}
  footer={
    <>
      <AppButton variant="outline" tone="neutral" disabled={isSaving} onClick={close}>取消</AppButton>
      <AppButton loading={isSaving} onClick={save}>保存</AppButton>
    </>
  }
>
  {body}
</AppModal>
```

Remove local header/body/footer height and overflow styles after moving them into the shared component.

- [ ] **Step 2: Replace destructive native confirmations**

```ts
const confirm = useAppConfirm();
const accepted = await confirm({
  title: "确认删除",
  message: "只删除记录，不会删除真实文件。",
  confirmLabel: "删除记录",
  tone: "danger",
});
if (!accepted) return;
```

For form actions, prevent the first submit, await confirmation, then call `requestSubmit()` behind a one-shot confirmed guard so the action cannot run twice.

- [ ] **Step 3: Verify repository ownership**

Run: `rg -n '<(Modal|DraggableModal|Dialog)\b|window\.confirm' apps/web/src --glob '*.tsx'`

Expected: matches exist only inside the shared modal/confirm implementation or documented third-party primitives.

- [ ] **Step 4: Browser-test long and short dialogs**

Test comic merge, video merge, tag edit, file repair, settings reset, and one delete confirmation at 390×844, 768×1024, and 1440×900. Verify fixed header/footer, body-only scrolling, no footer wrapping, close guard, and keyboard behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "refactor(web): migrate dialogs to unified modal"
```

---

### Task 8: Migrate buttons, icon buttons, and tags across the web app

**Files:**

- Modify: application call sites under `apps/web/src/app/(site)`
- Modify: application call sites under `apps/web/src/app/admin`
- Modify: `apps/web/src/components/admin-workbench/admin-tab-strip.tsx`
- Modify: `apps/web/src/components/comic-detail-view.tsx`
- Modify: `apps/web/src/components/video-detail-view.tsx`
- Modify: `apps/web/src/components/pinned-actions.tsx`
- Modify: `apps/web/src/components/reader-view.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**

- Consumes: `AppButton`, `AppLinkButton`, `AppIconButton`, `AppTag`
- Produces: semantic tones and centralized interaction styling across the application

- [ ] **Step 1: Migrate standard actions**

Map primary create/save/confirm to `tone="primary"`, ordinary cancel/back/secondary to `neutral`, positive completion to `success`, caution to `warning`, destructive actions to `danger`, and informational actions to `info`. Keep native `type="submit" | "reset" | "button"` independent from semantic tone. Replace button-styled navigation with `AppLinkButton` rather than polymorphic `AppButton` props.

- [ ] **Step 2: Migrate compact actions**

Replace Mantine `ActionIcon` application call sites with `AppIconButton`. Every call supplies a Chinese `label`, and `tooltip` defaults to that label.

- [ ] **Step 3: Migrate status/category/removable tags**

Replace `AppBadge`, direct Mantine `Badge`, and hand-built status pills with `AppTag`. Domain helpers return `{ label, tone }`; they do not return raw hex colors. Removable tags supply `onRemove` and `removeLabel`.

- [ ] **Step 4: Remove dead page-local hover CSS**

Delete only selectors whose consumers were migrated, including page-specific button/tag hover rules. Preserve unrelated manga card, navigation, reader image, and layout rules.

- [ ] **Step 5: Audit direct usages**

Run searches for direct Mantine `Button`, `ActionIcon`, `Badge`, raw `<button>`, and old `AppBadge`. Classify low-level implementation matches in `components/ui` as allowed; migrate every feature-level match.

- [ ] **Step 6: Verify and commit by surface**

Run lint and typecheck after admin, site, and reader/workbench groups. Pointer- and keyboard-check each tone plus loading/disabled states.

```bash
git commit -m "refactor(web): unify admin action styling"
git commit -m "refactor(web): unify site and reader action styling"
```

---

### Task 9: Codify conventions and run the final quality gate

**Files:**

- Modify: `.trellis/spec/web/frontend/component-guidelines.md`
- Modify: `.trellis/spec/web/frontend/directory-structure.md`
- Modify: `.trellis/spec/web/frontend/quality-guidelines.md`
- Modify: `docs/plan.md` only if implementation discoveries changed the approved contract

**Interfaces:**

- Consumes: the final component API and migration evidence
- Produces: executable project guidance for future screens

- [ ] **Step 1: Document actual conventions**

Document when to use `AdminCrudList` versus `AdminDataTable`, controlled-state ownership, exact import paths, sequence/selection/fixed-column examples, modal footer usage, semantic tone mapping, and forbidden feature-level direct Mantine table/modal/button/badge usage.

- [ ] **Step 2: Run static audits**

Run the Table/Modal/Dialog/Button/ActionIcon/Badge/native-confirm searches from Tasks 6–8. Record each remaining low-level exception and remove obsolete compatibility aliases only when no call site remains.

- [ ] **Step 3: Run automated checks**

Run: `npm run lint -w apps/web`

Expected: PASS.

Run: `npm run typecheck -w apps/web`

Expected: PASS.

Run: `npm run test -w apps/web`

Expected: PASS.

Run: `npm run build -w apps/web`

Expected: PASS.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Run the browser acceptance matrix**

Check admin comics, videos, tags, paths, files, downloads, collections, Pixiv sync, comic detail, and video detail at 390px, 768px, and desktop width. Check toolbar placement, pagination, horizontal scroll, fixed actions, selection, empty/loading states, all modal sizes, keyboard focus, and destructive confirmation.

- [ ] **Step 5: Commit**

```bash
git add .trellis/spec/web/frontend docs/plan.md
git commit -m "docs(web): codify shared UI conventions"
```
