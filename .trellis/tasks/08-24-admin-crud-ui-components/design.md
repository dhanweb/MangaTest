# Unified Admin CRUD and Application UI Primitives — Technical Design

## Architecture

The implementation has three layers. Global primitives wrap Mantine and own visual/interaction contracts. Admin presentation components compose those primitives but remain domain-agnostic. Page adapters own filtering, API calls, mutations, and domain-to-tone mappings.

```text
admin page / detail panel
  -> AdminCrudList<T> (toolbar + content + pagination)
     -> AdminDataTable<T> (columns + special columns)
        -> AppButton / AppLinkButton / AppIconButton / AppTag / AppEmptyState

any application feature
  -> AppModal / AppConfirmDialog
     -> fixed header + scroll body + fixed footer
```

No component in this design imports a domain module or calls an application API.

## Proposed File Structure

```text
apps/web/src/components/
├── admin-ui/
│   ├── admin-crud-list.tsx
│   ├── admin-data-table.tsx
│   ├── admin-list-state.ts
│   ├── admin-list-state.test.ts
│   ├── admin-page-header.tsx
│   └── types.ts
└── ui/
    ├── app-button.tsx
    ├── app-confirm-dialog.tsx
    ├── app-modal.tsx
    ├── app-tag.tsx
    ├── empty-state.tsx
    ├── overflow-tooltip-text.tsx
    └── app-components.tsx   # compatibility barrel
```

Existing shadcn/base-ui files may remain temporarily for external primitives, but application code must consume the `App*` API.

## Public Contracts

### Button and icon button

```ts
export type AppTone = "primary" | "neutral" | "success" | "warning" | "danger" | "info";
export type AppButtonVariant = "filled" | "light" | "outline" | "subtle" | "transparent";
export type AppControlSize = "xs" | "sm" | "md" | "lg";

export type AppButtonStyleProps = {
  tone?: AppTone;
  variant?: AppButtonVariant;
  size?: AppControlSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export type AppButtonProps = Omit<MantineButtonProps, "color" | "variant" | "size" | "leftSection" | "rightSection"> &
  AppButtonStyleProps;

export type AppIconButtonProps = Omit<ActionIconProps, "color" | "variant" | "size" | "aria-label"> & {
  label: string;
  tone?: AppTone;
  variant?: Exclude<AppButtonVariant, "transparent">;
  size?: AppControlSize;
  children: ReactElement;
  tooltip?: string;
};

export type AppLinkButtonProps = AppButtonStyleProps & Omit<NextLinkProps, "color"> & {
  children: ReactNode;
};
```

`AppLinkButton` renders Mantine `Button` with Next `Link` without weakening `AppButton` to an arbitrary polymorphic `any` contract. Compatibility aliases translate current `leftSection`/`color` call sites only while each file is migrated. New code uses `leftIcon` and `tone`.

### Tag

```ts
type AppTagBaseProps = {
  children: ReactNode;
  tone?: AppTone;
  variant?: "soft" | "outline" | "filled";
  size?: "xs" | "sm" | "md";
  icon?: ReactNode;
  interactive?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
};

export type AppTagProps = AppTagBaseProps &
  ({ href: string; onClick?: never } | { href?: never; onClick?: MouseEventHandler<HTMLButtonElement> });
```

The tag renders static text by default. `interactive`, link composition, or `onRemove` enables hover/focus chrome.

### Modal

```ts
export type AppModalSize = "sm" | "md" | "lg" | "xl" | "fullscreen";

export type AppModalProps = Omit<MantineModalProps, "children" | "title" | "size" | "styles"> & {
  title: ReactNode;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: AppModalSize;
  draggable?: boolean;
  preventClose?: boolean;
  bodyPadding?: MantineSpacing;
};
```

The content uses `max-height: calc(100dvh - 32px)`, `display:flex`, `flex-direction:column`, and `overflow:hidden`. Header/footer are `flex:0 0 auto`; body is `flex:1 1 auto; min-height:0; overflow-y:auto`. The footer uses `display:flex; flex-wrap:nowrap; overflow-x:auto`, and each direct button has `flex-shrink:0`.

`AppConfirmProvider` exposes:

```ts
type ConfirmOptions = {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Extract<AppTone, "primary" | "warning" | "danger">;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
```

Only one confirmation is displayed at a time; subsequent requests queue. Resolution is idempotent, and provider unmount resolves outstanding requests as `false`.

### Admin table

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
  headerLabel?: string;
};

export type AdminTableSelection<T> = {
  selectedKeys: ReadonlySet<string>;
  onSelectedKeysChange: (keys: Set<string>) => void;
  isRowSelectable?: (row: T) => boolean;
  getCheckboxLabel: (row: T) => string;
};

export type AdminDataTableProps<T> = {
  rows: readonly T[];
  columns: readonly AdminTableColumn<T>[];
  getRowKey: (row: T) => string;
  rowNumber?: false | { page: number; pageSize: number; header?: ReactNode };
  selection?: AdminTableSelection<T>;
  loading?: boolean;
  empty?: ReactNode;
  minWidth?: number;
  onRowClick?: (row: T) => void;
};
```

Column order is selection, row number, declared data columns. Fixed positioning is calculated from declared widths; a fixed column without a deterministic width is rejected in development. The standard operation column is declared with `fixed: "right"`, `wrap: false`, and a fixed width.

### CRUD/list shell

```ts
export type AdminListFilter = {
  key: string;
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | null) => void;
  width?: number;
};

export type AdminListPagination = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
};

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

The shell is controlled. Consumers filter/sort/slice local arrays or pass server-produced rows and totals. Changing search/filter/page size resets page in the consumer. The shared `clampPage(page, total, pageSize)` helper prevents blank pages after deletes or filter changes.

## State and Data Flow

```text
server page loads domain records
  -> client panel owns search/filter/page/selectedKeys
  -> page predicate computes filtered records
  -> page slices visible records
  -> AdminCrudList renders controlled toolbar/pagination
  -> AdminDataTable renders visible records
  -> page action invokes existing mutation/API
  -> existing toast + refresh behavior runs
```

The table never stores selected records internally. This prevents stale index-based selection after sorting/filtering and lets future server pagination preserve selections.

## Styling and Theme

- `theme.tsx` remains the palette source. Semantic tone maps are exported once and reused by buttons and tags.
- Component hover/focus styles live inside the wrapper component or theme extension, not page-local style objects.
- Admin table surfaces use existing CSS variables (`--pink`, `--pink-soft`, `--pink-line`, ink tokens) and opaque backgrounds for sticky cells.
- Motion remains short and functional. Respect `prefers-reduced-motion` through Mantine defaults and avoid new decorative animation.

## Migration Strategy

1. Add new primitives with compatibility exports; no page behavior changes.
2. Pilot `AdminCrudList`/`AdminDataTable` on comics and videos. These pages verify the toolbar requirement, two pagination variants, sticky action column, row numbers, and visual density.
3. Migrate tags, paths, video paths, files, collections, downloads, Pixiv sync, and both detail panels. Operational/detail tables use `AdminDataTable` without fake CRUD controls.
4. Replace remaining buttons, action icons, tags/badges, direct modals, and native confirmations application-wide.
5. Remove compatibility aliases only after searches show no legacy call sites. Keep the barrel as the supported public import surface.

## Compatibility and Rollback

- No API or domain types change.
- Initial components are additive and existing exports remain available, allowing per-page rollback.
- Each migration wave should be committed independently. If a complex page regresses, revert only that page adapter while retaining the new primitives.
- Do not delete `button.tsx`, `dialog.tsx`, `badge.tsx`, or other low-level files until a repository search proves no application code depends on them; deletion is not required for acceptance.

## Important Trade-offs

- The table is deliberately not a full data grid. Sorting, column resizing, virtualization, inline editing, and server query construction are excluded until a real screen needs them.
- Controlled props create slightly more page adapter code but keep domain and network behavior out of a supposedly generic component.
- Manual browser verification is required for layout because the current repository has no DOM/browser test stack. Pure state algorithms remain unit-tested.
