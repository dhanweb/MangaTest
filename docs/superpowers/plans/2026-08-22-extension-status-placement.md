# Extension Status Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each browser-site page adapter to control where the detail-page library status badge is rendered, while keeping a right-top viewport position as the default.

**Architecture:** Add a small runtime status-placement module that supports a viewport mode with `top`/`right`/`bottom`/`left` offsets and a custom mode with an adapter-owned mount callback. The common injector creates and updates the badge but delegates mounting to this module; site adapters opt in only when a site needs a non-default position.

**Tech Stack:** Chrome Manifest V3, vanilla JavaScript content scripts, DOM/CSS, Node-based extension checks.

## Global Constraints

- `apps/extension` remains an unpacked Chrome MV3 extension and communicates with the web app through the existing runtime/backend boundary.
- The default status placement is fixed to the viewport with `top: 16px` and `right: 16px`.
- A custom adapter mount may select the target DOM node, insertion method, and element-specific styling; a failed custom mount falls back to the default viewport placement.
- Every change under `apps/extension/` must bump `manifest.json` and `package.json` to the same version.
- Do not change the status text semantics; only the status badge mounting behavior is in scope.

---

### Task 1: Add the status placement runtime contract

**Files:**
- Create: `apps/extension/src/runtime/status-placement.js`
- Modify: `apps/extension/scripts/check-extension.mjs`

**Interfaces:**
- Produces `window.MangaTestStatusPlacement.mount(element, placement, context)`.
- `placement` is either `{ mode: "viewport", top?, right?, bottom?, left? }` or `{ mode: "custom", mount({ element, document, location }) }`.

- [x] **Step 1: Add checks for both placement modes**

Load the runtime module in the existing VM check and assert that viewport mode appends the element with `position: fixed`, default `top/right`, and custom offsets; assert that custom mode calls the adapter callback and that a callback returning `false` falls back to the viewport.

- [x] **Step 2: Run the focused extension check and confirm it fails**

Run `npm run check -w apps/extension`.

Expected: the new placement check fails because `src/runtime/status-placement.js` does not yet provide the contract.

- [x] **Step 3: Implement the minimal runtime module**

Implement the public contract with this behavior:

```js
mount(element, placement, context) {
  const resolved = typeof placement === "function" ? placement(context) : placement;
  if (resolved?.mode === "custom" && typeof resolved.mount === "function") {
    if (resolved.mount({ element, document: context.document, location: context.location }) !== false) return true;
  }
  Object.assign(element.style, {
    position: "fixed",
    top: toCssOffset(resolved?.top) || "16px",
    right: toCssOffset(resolved?.right) || "16px",
    bottom: toCssOffset(resolved?.bottom) || "auto",
    left: toCssOffset(resolved?.left) || "auto",
  });
  context.document.body.appendChild(element);
  return true;
}
```

`toCssOffset` accepts numbers as pixel values and non-empty CSS strings as-is.

- [x] **Step 4: Run the focused check again**

Run `npm run check -w apps/extension` and confirm the placement assertions and existing collector checks pass.

- [x] **Step 5: Commit the runtime contract**

```bash
git add apps/extension/src/runtime/status-placement.js apps/extension/scripts/check-extension.mjs
git commit -m "feat: add adapter-controlled status placement"
```

### Task 2: Delegate badge mounting from the common injector

**Files:**
- Modify: `apps/extension/src/content/injector.js:189-215`
- Modify: `apps/extension/manifest.json`
- Modify: `apps/extension/package.json`

**Interfaces:**
- Consumes `page.statusPlacement` from the selected site page handler.
- Uses `window.MangaTestStatusPlacement.mount` before wiring the rest of the common panel.

- [x] **Step 1: Replace the hardcoded badge append**

Change the badge insertion from `document.body.appendChild(badge)` to:

```js
const mounted = window.MangaTestStatusPlacement?.mount(badge, page.statusPlacement, { document, location });
if (!mounted) document.body.appendChild(badge);
```

Keep the operation panel’s existing bottom-right placement unchanged.

- [x] **Step 2: Load the runtime module before the injector**

Insert `src/runtime/status-placement.js` before `src/content/injector.js` in the manifest content-script list and add it to the check script’s referenced files and syntax checks.

- [x] **Step 3: Bump the extension version**

Bump both version fields from `0.4.5` to `0.4.6`.

- [x] **Step 4: Run extension validation**

Run:

```bash
npm run check -w apps/extension
npm run build -w apps/extension
git diff --check
```

Expected: the check passes and the build creates `apps/extension/dist/MangaTest-Extension-v0.4.6.zip`.

- [x] **Step 5: Commit the injector integration**

```bash
git add apps/extension/src/content/injector.js apps/extension/manifest.json apps/extension/package.json apps/extension/scripts/check-extension.mjs
git commit -m "feat: delegate status badge mounting to adapters"
```

### Task 3: Document the adapter contract and verify the handoff

**Files:**
- Modify: `apps/extension/README.md`
- Modify: `docs/plan.md`

**Interfaces:**
- Documents the exact `page.statusPlacement` shape for future site adapters.

- [x] **Step 1: Document the two supported adapter modes**

Add an example for viewport offsets:

```js
statusPlacement: { mode: "viewport", top: "72px", right: "16px" }
```

and an example for custom DOM mounting:

```js
statusPlacement: {
  mode: "custom",
  mount({ element, document }) {
    const target = document.querySelector(".site-header");
    if (!target) return false;
    target.appendChild(element);
    return true;
  },
}
```

- [x] **Step 2: State the fallback and scope explicitly**

Document that absent or failed placement configuration uses the default top-right viewport badge, while the operation panel remains common bottom-right UI.

- [x] **Step 3: Run the final verification**

Run `npm run check -w apps/extension`, `npm run build -w apps/extension`, and `git diff --check`; inspect `git status --short` and confirm only intended files changed.

- [x] **Step 4: Commit the documentation**

```bash
git add apps/extension/README.md docs/plan.md
git commit -m "docs: describe adapter status placement"
```

## Self-review checklist

- The default top-right behavior is covered by the runtime check and remains unchanged for ExHentai and NHentai.
- Four-edge viewport adjustment is represented by explicit `top`, `right`, `bottom`, and `left` fields.
- Full DOM ownership is represented by a custom mount callback with a `false` fallback path.
- Status rendering remains in the common injector; adapters only describe site-specific placement.
- ZIP/CBZ/download behavior and status text logic are outside this change.
