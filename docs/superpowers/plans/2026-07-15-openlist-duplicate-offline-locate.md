# OpenList 10008 任务已存在 → 固定目录定位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When OpenList rejects offline submit with code `10008` (“任务已存在，请勿输入重复的链接地址”), automatically search a configured library root (default `/115Open/HENTAI/exhentai`) for the matching comic zip and create a transfer/download path; if not found, fail with a clear manual-recovery message.

**Architecture:** Keep create-time OpenList submit as the happy path. On submit failure classified as “duplicate offline task”, run a **live limited-depth locator** under one configured remote root: **flat** `{root}/{mangaName}/…`. Do **not** require a prebuilt full-tree index for correctness. Reuse existing transfer creation + download pipeline once a concrete remote file path is known.

**Tech Stack:** TypeScript, existing `modules/downloads` + OpenList `api/fs/list` / transfer flow, Vitest, runtime settings (optional new setting key).

## Global Constraints

- Offline OpenList magnet submit still happens once at create/retry via `dispatchTaskNow`; worker offline tick remains poll-only.
- Do not submit the magnet again after 10008.
- Default search root: `/115Open/HENTAI/exhentai`.
- **Flat tree (locked):** `{root}/{mangaName}/{file}.zip|cbz` — **no author directory level**. Match primarily on the manga folder name directly under root.
- Prefer `refresh: false` for list calls; serial listing; depth capped at 2 under root (manga dir + archives).
- Logs must not include full magnet URLs.
- Physical cloud files are never deleted by this flow.
- User-facing Chinese errors for not-found must mention the search root and manual move/retry steps.

---

## Product Answers (locked)

### Flat library root (locked 2026-07-15)

User moved all comics under one root **without author folders**:

```text
/115Open/HENTAI/exhentai/
  └── [漫画名称]/          # primary match target (directory name)
        └── *.zip / *.cbz     # transfer target inside the folder
```

- No `{author}` level.
- Match `[漫画名称]` directly under `/115Open/HENTAI/exhentai`.
- Then list that folder to pick the archive.

### When 10008 happens

1. Classify submit result as `duplicate_task`.
2. Build name hints from: comic title, resource displayLabel, file-like name if present.
3. Live-search under configured root:
   - L1: manga dirs (and any loose zip/cbz files) directly under root — **primary match on dir/file name**
   - L2: archive files inside matched manga dir
4. If unique high-confidence match:
   - mark offline task completed with usable remote path context
   - create `transfer` task with concrete zip `remotePath`
   - dispatch transfer as today
5. If ambiguous matches (close scores): **MVP fail with top candidate paths listed** (no silent wrong pick).
6. If none: fail with explicit message:
   - OpenList 返回任务已存在（10008）
   - 已在 `{root}` 下按漫画名称查找未找到
   - 请手动确认云端位置，或把漫画目录/zip 移到该根下后重试任务

### Do users need to rescan after moving files into the root?

**No full rescan required for this feature.**

| Approach | After manual move into `/115Open/HENTAI/exhentai` |
|----------|-----------------------------------------------------|
| **MVP: live search on 10008 / retry** | Move files → click **重试** → system lists the root again and can find new paths. **No separate scan-index step.** |
| Optional later: persistent local index | Index becomes stale until rebuild/partial refresh. |

**Recommendation:** MVP uses live search so “搬家后重试” just works.

### Happy path after today

- New offline via plugin/backend still submits to OpenList (current save path).
- 10008 recovery is only for already-existing 115 offline history under the exhentai root.

---

## File Map

| File | Responsibility |
|------|----------------|
| `apps/web/src/modules/downloads/providers/openlist/connection.ts` | Detect 10008; structured submit status |
| `apps/web/src/modules/downloads/openlist-duplicate-locate.ts` (new) | Name normalize/score + flat L1–L2 walk |
| `apps/web/src/modules/downloads/index.ts` | On duplicate submit, locate → transfer or fail message |
| settings (optional) | `openlistDuplicateSearchRoot` default `/115Open/HENTAI/exhentai` |
| `openlist-duplicate-locate.test.ts` / `offline-duplicate-recover.test.ts` | Unit + module tests |
| `docs/plan.md` / `docs/implemented-features.md` | Document after implement |

---

## Behavior Detail

### 1) Classify duplicate submit

When `payload.code === 10008` or message matches `/任务已存在|重复的链接/`, return:

```ts
{
  ok: false,
  status: "duplicate_task",
  message: payloadMessage,
  taskId: null,
  apiCheck,
  openlistCode: 10008,
}
```

### 2) Name hints

From task/resource: `comicTitle`, `resourceLabel` / displayLabel.  
Normalize: trim, lowercase, strip `.zip`/`.cbz`, collapse whitespace.

### 3) Live walk (serial, flat)

```text
list(root) -> children[]
for child in children:
  if child is archive (zip/cbz) and score(child.name, hints) high:
    candidate file = child
  if child is directory and score(child.name, hints) high enough:
    list(root/child) -> files[]
    pick best archive among zip/cbz under that dir
early-stop on exact directory name match + single zip
```

Controls:

- soft `maxListCalls` (e.g. 200; often just 1 + N matched dirs)
- optional 100–300ms delay between lists
- `refresh: false`
- Because there is no author level, **one list of root** already yields all manga names — much cheaper than the old author tree.

### 4) Success handoff

Create transfer with `remotePath` = zip file path, link `offlineTaskId`, reuse existing transfer dispatch.

### 5) Failure handoff

`failed` + Chinese message with 10008 meaning, search root, title/label hints (never full magnet), and “移动后重试”.

---

## Tasks

### Task 1: Structured 10008 classification

**Files:**
- Modify: `apps/web/src/modules/downloads/providers/openlist/connection.ts`

- [ ] Add `duplicate_task` status to offline submit result
- [ ] Map code 10008 / duplicate message
- [ ] Test mock 10008 → `duplicate_task`
- [ ] Run test

### Task 2: Locator module (flat root)

**Files:**
- Create: `apps/web/src/modules/downloads/openlist-duplicate-locate.ts`
- Create: `apps/web/src/modules/downloads/openlist-duplicate-locate.test.ts`

- [ ] `normalizeOpenListMatchName` + `scoreOpenListNameMatch`
- [ ] `locateArchiveUnderOpenListRoot(...)` for flat `{root}/{mangaName}/zip`
- [ ] Tests: exact manga dir match, no match, ambiguous, root-level zip edge case
- [ ] Run tests

### Task 3: Wire into offline magnet dispatch

**Files:**
- Modify: `apps/web/src/modules/downloads/index.ts`
- Create: `apps/web/src/modules/downloads/offline-duplicate-recover.test.ts`

- [ ] On duplicate submit: locate → transfer or failed message
- [ ] Tests: found path creates transfer once; not found message includes root
- [ ] Regression: normal submit still once; offline worker poll-only
- [ ] Run tests

### Task 4: Setting for search root (if cheap)

- [ ] `openlistDuplicateSearchRoot` default `/115Open/HENTAI/exhentai`
- [ ] Or constant default first if settings UI is heavy

### Task 5: Docs

- [ ] Update `docs/plan.md` + `docs/implemented-features.md`
- [ ] Note flat root + 搬家后点重试即可，无需先全量扫索引

---

## Test Plan

1. Name normalization/scoring unit tests
2. Flat tree walk with injected list results
3. 10008 → found zip → offline completed + transfer with remotePath
4. 10008 → not found → failed message
5. Normal offline submit regression

---

## Out of Scope (YAGNI)

- Full persistent cloud index / admin “扫全库” job
- OpenList `fs/search`
- Author-level layout (removed by user)
- Changing default offline save path
- Auto-pick among low-confidence ambiguous matches
- Physical moves on 115 via API

---

## Implementation Order

1. Classify 10008
2. Locator + tests (flat)
3. Dispatch recovery + tests
4. Setting (if cheap)
5. Docs

---

## Rescan answer (locked)

> 把漫画移动到 `/115Open/HENTAI/exhentai` 后，是不是又要扫一次？

**按本计划：不用先做全量扫描。**  
10008 恢复是**当场 list 该根**。移完后对失败任务点**重试**即可。  

只有以后做了持久化云端索引，搬家后才需要刷新索引。MVP 不依赖索引。

---

## Plan Review (2026-07-15, post flat-root lock)

### Consistency check vs normal success path

| Step | Normal offline complete → pull-back | 10008 recovery (this plan) |
|------|--------------------------------------|----------------------------|
| Locate | list savePath + one nested dir | list fixed root + one nested manga dir |
| Match | `scoreNameMatch` on file name / parent dir | same scoring spirit on **manga dir name**, then archives |
| Download target | **concrete zip/cbz file path** | **same: zip/cbz file path**, never the manga directory |
| Transport | create `transfer` + `dispatchTaskNow` | same |

**Locked:** recovery must end with `remotePath` pointing at the **archive file**, consistent with normal downloads.

**Implementation preference:** extract or reuse `scoreNameMatch` / archive-picking logic from `index.ts` pull-back helpers so scoring does not drift.

### Gaps found and plan amendments

1. **OpenList error shape may not put `10008` only in `payload.code`**  
   Real messages often look like:  
   `failed to add offline download task: code: 10008, message: 任务已存在…`  
   Classifier must accept:
   - `payload.code === 10008`
   - message / nested text containing `code: 10008` or `任务已存在` / `重复的链接`  
   Otherwise recovery never triggers.

2. **Root listing must paginate**  
   Flat root can have many manga folders. One `fs/list` page is not enough.  
   Locator must page through root (`page` / `per_page`) until exhausted or soft cap, same spirit as cloud-scan pagination.

3. **`refresh: false` vs “I just moved files”**  
   After manual moves, cached list may miss new folders.  
   **Amendment:** recovery search uses `refresh: true` **only for the root list (first level)** once per recovery attempt; nested manga-dir lists may stay `refresh: false` unless empty when exact name matched.  
   This keeps “搬家后点重试即可” true without requiring a separate index scan, while avoiding refresh-all on every child.

4. **Retry path is the recovery entry for already-failed tasks**  
   Failed 10008 task → user 重试 → `retryDownloadTask` → `queued` → `dispatchTaskNow` → submit again → 10008 → locate again.  
   No separate “re-locate only” API required for MVP. Document this in UI error text: “处理好云端文件后请重试该任务”.

5. **Scope: magnet offline only (MVP)**  
   Wire recovery in `dispatchTaskNow` branch  
   `taskType === "offline" && provider === "openlist" && resourceType === "magnet"`.  
   Do not invent recovery for unrelated failures.

6. **Success state machine must not leave orphan `submitted` offline**  
   On locate success:
   - offline task → `completed` (not `submitted`)
   - set `remotePath` to the **zip path** (or parent manga dir + transfer holds zip; prefer zip on transfer, offline may store manga dir or zip for audit — **transfer.remotePath must be zip**)
   - `remoteTaskId` may stay null on 10008 (no new OL task id)
   - create transfer with `offlineTaskId` link
   - dispatch transfer once  
   Avoid calling normal `createTransferTaskFromOfflineTask` against `/115Open/Temp` when the file lives under exhentai root — either pass resolved zip path in or add a “known remote file” create-transfer helper.

7. **Ambiguous / multi-zip inside one manga dir**  
   - Multiple manga dirs with similar scores → fail with top candidates (paths), no auto pick.  
   - Single manga dir, multiple zips → pick by name score then largest file (**same as pull-back**), not fail.

8. **Large roots / soft cap messaging**  
   If `maxListCalls` or max root entries hit before match: failed message must say 搜索未完成/达到上限，请缩小目录或检查名称，not pretend “not in library”.

9. **Settings file locations**  
   Settings live under `apps/web/src/modules/core/settings/` (`types.ts`, `defaults.ts`, UI).  
   Adding `openlistDuplicateSearchRoot` touches those + admin OpenList settings group.  
   If costly, constant default is OK for MVP; document constant in code.

10. **UI surface**  
    No new page required. Rely on download task `errorMessage` / success transfer appearing in admin downloads. Optional toast already follows task create/retry.

11. **Idempotency**  
    If recovery already created an active transfer for this offline task/resource, do not create a second transfer on double retry — check active transfer by `comicResourceId` / `offlineTaskId` first.

12. **Plugin path**  
    Covered automatically: plugin → `createDownloadTask` → `dispatchTaskNow` (same recovery). No second submit in import-with-magnet.

### Explicit non-gaps (confirmed OK)

- Flat root without author level — locked.
- Live search, no mandatory full index — locked.
- Move into root then retry without full rescan — locked (with root `refresh: true` amendment).
- Worker remains poll-only for offline — locked.
- Do not re-submit magnet after 10008 — locked.
- Transfer downloads zip, not manga directory — locked, consistent with normal path.

### Residual risks (accept for MVP)

- Title vs 115 folder name mismatch → not found; user renames/moves and retries.
- Very large root + slow 115 → recovery attempt may take seconds; keep serial + soft cap.
- 115 rate limits if user retries many failed tasks in a burst — acceptable; no global queue in MVP.

### Pre-implement checklist (add to Task 3)

- [ ] Parse nested 10008 in message text, not only top-level code
- [ ] Paginate root list
- [ ] Root list `refresh: true` once per recovery; children default false
- [ ] Transfer `remotePath` = archive file path only
- [ ] Reuse/share name scoring with pull-back
- [ ] Offline completed + single transfer; no Temp-path pull-back for this recovery
- [ ] Idempotent transfer creation on retry
- [ ] Magnet offline branch only
- [ ] Error copy mentions root + 重试
