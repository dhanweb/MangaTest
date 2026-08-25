# Admin UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复后台管理页面的固定操作列、请求 loading、可清除筛选、输入框焦点、标签弹框和系统目录弹框交互问题，并验证 Next.js 开发期控制台无新增错误。

**Architecture:** 页面继续拥有筛选、请求和 loading 状态；共享 `AdminDataTable`、`AdminCrudList`、`AppButton`、`AppModal` 只负责受控展示和交互契约。系统目录弹框使用 `AppModal` 的固定 header/body/footer 结构与受限桌面拖拽，不把业务逻辑移入共享组件。

**Tech Stack:** Next.js App Router, React, TypeScript, Mantine, CSS variables, Vitest, npm workspaces, browser-based QA.

## Global Constraints

- 遵循 `docs/plan.md` 和 `AGENTS.md`，不改变后端/API/数据库/业务规则。
- 保留已有用户未提交文件：`.trellis/tasks/08-24-admin-crud-ui-components/task.json`、`dev-server.pid` 和其他既有计划文档。
- 不新增 UI 库或数据请求框架；共享组件不调用 API。
- 所有新交互支持键盘可见 focus 状态，输入控件不得通过 Mantine `styles` 传嵌套 selector。
- 完成前运行定向测试、typecheck、build、lint，并在浏览器验证原始问题。

---

### Task 1: Fixed operation hover and refresh state

**Files:**
- Modify: `apps/web/src/components/admin-ui/admin-data-table.tsx`
- Modify: `apps/web/src/components/admin-workbench/admin-tab-provider.tsx`
- Modify: `apps/web/src/components/admin-workbench/admin-tab-strip.tsx`
- Modify: `apps/web/src/app/admin/comics/comics-panel.tsx`
- Modify: `apps/web/src/app/admin/videos/videos-panel.tsx`

**Implementation:** remove body fixed-cell inline `backgroundColor`, use fixed-cell classes and shared CSS states for normal/hover/selected backgrounds; expose a transition-backed `refreshing` state from `AdminTabProvider`, and pass it to list refresh controls and the active-tab refresh action.

**Verification:** `npm run typecheck -w apps/web`; browser hover the right operation cell and click refresh on comics/videos, confirming opaque hover and disabled spinner state until refresh completes.

### Task 2: Clearable status filters

**Files:**
- Modify: `apps/web/src/app/admin/comics/comics-panel.tsx`
- Modify: `apps/web/src/app/admin/videos/videos-panel.tsx`

**Implementation:** make status state `string | null`, preserve `null` from `AppSelect` `onChange`, and treat `null`/empty as no status predicate while retaining current defaults (`readable` for comics, `all` for videos).

**Verification:** browser clear both status filters and confirm the select remains empty and the result list is unfiltered; run typecheck.

### Task 3: Shared button loading layout

**Files:**
- Modify: `apps/web/src/components/ui/app-button.tsx`
- Test: existing `apps/web` typecheck/build plus browser checks in `apps/web/src/app/admin/files/files-panel.tsx`

**Implementation:** keep the original button content width and inline icon/text layout while loading, show a compact loader in the content position, preserve `aria-busy` and disabled semantics, and avoid Mantine's content-reflowing loading layout. Keep icon-only behavior compatible.

**Verification:** browser check files page top actions, row actions, and repair dialog at loading time; text stays horizontal and button dimensions do not jump.

### Task 4: Modal sizing, fixed footer, and constrained dragging

**Files:**
- Modify: `apps/web/src/components/ui/app-modal.tsx`
- Modify: `apps/web/src/app/admin/paths/system-root-path-dialog.tsx`
- Modify: `apps/web/src/app/admin/tags/tags-panel.tsx`

**Implementation:** add typed body sizing options bounded by `calc(100dvh - modal chrome)`, keep only the body scrollable, move system-dialog actions into `footer`, enable desktop drag on the system dialog, clamp drag position to the viewport and reset it on close, and widen the tag editor to `lg` with footer actions.

**Verification:** browser test path dialog drag, long body scroll, fixed footer, manual height at 390px/768px/desktop; test tag editor width and footer at the same viewports.

### Task 5: Global input focus treatment

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/ui/app-components.tsx`
- Modify only where needed after search: admin direct Mantine/native input call sites

**Implementation:** define one keyboard-visible pink focus ring/border rule for shared Mantine inputs, selects, textareas, native inputs and compatible low-level controls; apply classes through `AppInput`, `AppSelect`, and `AppTextarea` without inline nested selectors. Do not override existing disabled/read-only behavior or valid low-level focus styles.

**Verification:** browser keyboard-tab through comics, tags, paths and files controls; confirm every editable control has the same visible focus treatment and no React style warning.

### Task 6: Tags clear performance root-cause fix

**Files:**
- Inspect/modify: `apps/web/src/app/admin/tags/tags-panel.tsx`
- Inspect/modify: `apps/web/src/components/admin-workbench/use-admin-tab-state.ts`
- Test: add/adjust focused pure state test only if a deterministic regression can be isolated

**Implementation:** reproduce the clear action first and compare render/state transitions with comics/videos. Instrument temporarily if needed, then remove diagnostics and apply the smallest evidence-backed change (normalizing cleared value to `null`, avoiding redundant persistence or derived-option work). Do not add arbitrary timeouts.

**Verification:** repeat clear-category interaction several times, confirm no visible pause, no console errors, and no change to tab-state persistence; run focused test if added.

### Task 7: Full quality and commit gate

**Files:** affected files above plus the plan document.

**Verification commands:**

```text
npm run test -w apps/web
npm run typecheck -w apps/web
npm run lint -w apps/web
npm run build -w apps/web
git diff --check
```

Record existing unrelated failures separately. Review the final diff to ensure no unrelated dirty paths are staged, then create one commit with message `fix(web): polish admin controls and modal behavior`.

**Acceptance checklist:** operation hover works; comics/videos refresh shows loading; status clears to an empty unfiltered value; files buttons keep horizontal text layout; tag modal is wider; all editable inputs show focus; system path modal drags within viewport with fixed footer and bounded body; clearing tag category has no avoidable pause; Next.js browser console has no new errors.
