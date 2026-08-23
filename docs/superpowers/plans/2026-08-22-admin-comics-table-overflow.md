# Admin Comics Table Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Keep the `/admin/comics` table readable when titles are long by constraining the title cell to two visible lines, showing the full value in a tooltip only when clipped, enabling horizontal scrolling, and keeping the operation column visible while scrolling.

**Architecture:** Continue using Mantine's `Table` primitives. The page will use Mantine's native `Table.ScrollContainer` with a fixed-layout table and explicit minimum width; the operation header/cells will use CSS `position: sticky` within that scroll container. A small page-local overflow-aware text component will measure its rendered width and enable Mantine `Tooltip` only when the single-line title value is actually truncated.

**Tech Stack:** Next.js App Router, React, TypeScript, Mantine `Table`/`Tooltip`, CSS `position: sticky`, Vitest/lint/typecheck.

## Global Constraints

- Keep business logic out of the page component; this is a presentation-only change.
- Keep the existing Mantine-based table implementation and visual style.
- Do not change pagination, filtering, database queries, or other admin tables.
- Preserve unrelated working-tree changes.

---

### Task 1: Confirm the current overflow cause

**Files:**
- Inspect: `apps/web/src/app/admin/comics/comics-panel.tsx`
- Inspect: `apps/web/node_modules/@mantine/core/lib/components/Table/TableScrollContainer.d.ts`

- [x] **Step 1: Verify the current table constraints**

Confirm that the current table uses `overflow: hidden`, does not set a fixed table layout or minimum width, and renders long title text inside an unconstrained cell. Confirm Mantine provides `Table.ScrollContainer` and `Tooltip` in the installed version.

- [x] **Step 2: Record the implementation boundary**

Keep all changes in `comics-panel.tsx`; add no new dependency and do not modify the shared table wrapper because the page already uses Mantine directly.

### Task 2: Add bounded title rendering and table scrolling

**Files:**
- Modify: `apps/web/src/app/admin/comics/comics-panel.tsx`

**Interfaces:**
- `OverflowTooltipText({ children, ...props })` renders one line with ellipsis and accepts a full string as the tooltip label.
- The table remains `Table`/`Table.*` from `@mantine/core` and is wrapped by `Table.ScrollContainer`.

- [x] **Step 1: Add the overflow-aware text helper**

Import `Tooltip`, `useEffect`, `useRef`, and `useState`. Implement a page-local `OverflowTooltipText` using a `div`-backed Mantine `Text`, `truncate`, and `ResizeObserver`; enable the tooltip only when `scrollWidth > clientWidth`.

```tsx
function OverflowTooltipText({ children, ...props }: { children: string } & TextProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const updateOverflow = () => setIsOverflowing(element.scrollWidth > element.clientWidth);
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  return (
    <Tooltip label={children} disabled={!isOverflowing} multiline maw={420} withArrow>
      <Text ref={textRef} component="div" truncate {...props}>
        {children}
      </Text>
    </Tooltip>
  );
}
```

- [x] **Step 2: Constrain the table layout**

Replace the `overflow: hidden` table wrapper with a bordered wrapper containing `Table.ScrollContainer minWidth={760} type="native"`. Set `layout="fixed"` and `style={{ minWidth: 760 }}` on `Table`. Keep the existing striping and spacing props.

- [x] **Step 3: Make the title cell occupy the flexible column**

Give the format, page count, status, and operation columns explicit widths. Set the title cell width to the remaining flexible space and add `minWidth: 0` to its inner box. Render `displayTitle` and `fileTitle` through `OverflowTooltipText`, so the title column is at most two single-line rows and each clipped value exposes the full value on hover.

- [x] **Step 4: Pin the operation column**

Apply `position: "sticky"`, `right: 0`, a matching surface background, and a left shadow to the operation `Table.Th` and each operation `Table.Td`. Use a higher `zIndex` for the header cell so it stays above body cells while horizontally scrolling. Keep the empty-state row's `colSpan={5}` unchanged.

### Task 3: Verify the behavior

**Files:**
- Verify: `apps/web/src/app/admin/comics/comics-panel.tsx`

- [x] **Step 1: Run formatting and type checks**

Run:

```powershell
npm run lint --workspace web -- src/app/admin/comics/comics-panel.tsx
npm run typecheck --workspace web
```

Expected: no new lint or TypeScript errors.

- [x] **Step 2: Verify the rendered table in the running app**

Open `http://127.0.0.1:4427/admin/comics` with a narrow viewport and a long-title row. Confirm the title area never exceeds two rows, clipped values show a tooltip on hover, a horizontal scrollbar appears when the table is wider than its container, and the operation button remains visible at the right edge while scrolling.

- [x] **Step 3: Review the diff**

Run `git diff --check` and inspect the diff to confirm only the comics table presentation changed; do not stage or revert unrelated user changes.
