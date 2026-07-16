# OpenList 10008：结构化识别 + 单飞扫描索引 + 批量拉回 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably detect OpenList offline duplicate error **10008**, maintain a single-flight paginated scan index of `/115Open/HENTAI/exhentai`, and batch-recover all pending 10008 offline tasks into transfer downloads of matching zip/cbz files.

**Architecture:** Split into three layers: (1) **structured error classification** on OpenList submit responses; (2) **library-root index scan** (paginated `fs/list`, flat `{root}/{mangaName}/archive`, single-flight); (3) **batch recovery runner** that matches pending duplicate tasks against the latest completed index and creates transfer tasks with concrete archive `remotePath`. Concurrent 10008s never start a second scan; they enqueue and wait for the in-flight scan to finish, then run one batch pull.

**Tech Stack:** TypeScript, SQLite/Drizzle (`cloud_scan_*` reuse or dedicated index tables), existing downloads module, OpenList `api/fs/list`, Vitest.

## Global Constraints

- Do **not** re-submit the magnet after 10008.
- Default library root: `/115Open/HENTAI/exhentai` (flat: manga dir → zip/cbz).
- Transfer target is always the **archive file path**, never the manga directory (consistent with normal pull-back).
- Offline worker remains poll-only for true OpenList offline progress; 10008 recovery is separate.
- Logs must not include full magnet URLs.
- Prefer **numeric error code** over Chinese full-text matching.
- Serial / low-concurrency list; root list paginated; child lists only for matched or scanned dirs as designed below.
- One global scan lock per root path.

---

## Current State (why it still fails)

### What exists today

- `submitOpenListOfflineDownload` can return `status: "duplicate_task"` when `isOpenListDuplicateOfflineError(code, message)`.
- Classifier currently accepts:
  - `code === 10008`
  - message contains `code: 10008`
  - message contains `任务已存在` / `重复的链接`
- `dispatchTaskNow` magnet branch calls `recoverOpenListDuplicateOfflineTask` which does **live** locate under the root (no persistent index, no batch, no single-flight scan).

### Why user still sees raw 10008

Likely one or more of:

1. **Response shape**: OpenList/115 often returns outer `code` ≠ 10008 (e.g. 500) with nested text; if our fail branch or nested parse misses, task is marked failed with raw message and recovery never runs.
2. **Live locate miss**: name hints (title/label) ≠ 115 folder name; or root not fully paged; or scan never built an index so multi-task storms each thrash list.
3. **No queue**: concurrent 10008s each live-search independently; no “scan once then fix all”.
4. **Old failed rows** stay as plain `failed` with raw message until retry under new logic.

### Answer to question (1): can we use error code?

**Yes — and we should prioritize code.**

OpenList HTTP JSON typically has top-level:

```json
{ "code": 500, "message": "failed to add offline download task: code: 10008, message: 任务已存在..." }
```

or sometimes:

```json
{ "code": 10008, "message": "任务已存在，请勿输入重复的链接地址" }
```

**Detection policy (locked):**

| Priority | Rule | Notes |
|----------|------|--------|
| P0 | `payload.code === 10008` | Best |
| P1 | Parse nested `code:\s*(\d+)` from `payload.message` (and `data` string fields if any) → `=== 10008` | Handles wrapped errors |
| P2 | Optional weak fallback: message includes both `10008` and (`任务已存在` or `duplicate`) | **Do not** match Chinese alone without 10008 |
| Reject | Chinese-only match without 10008 | Avoid false positives |

Expose parsed `openlistCode: 10008` always when classified duplicate.

---

## Target Product Flow (locked)

```text
create/retry offline magnet
  → submit OpenList offline
  → if not 10008: existing success/fail path
  → if 10008:
       mark offline task pending_duplicate_recovery
         (status: failed OR dedicated status; store errorCode=10008)
       ensureLibraryRootIndex(root):
         if scan running for root → wait / join
         else if no usable completed index → start scan (paginated)
         else use latest completed index (optionally stale TTL later)
       when index ready:
         batchRecoverPendingDuplicateTasks(root)
           for each pending 10008 task:
             match mangaName / zip from index
             if unique archive → create transfer + dispatch
             if ambiguous / none → keep failed with clear Chinese message
```

### Scan single-flight rules

- Key: `provider=openlist` + `rootPath=/115Open/HENTAI/exhentai`
- If session `status=running` exists for that key → **do not start another scan**
- New 10008 tasks only enqueue as `pending_duplicate_recovery`
- When running session finishes → **one** batch recovery pass for all pending tasks
- If a 10008 arrives during scan, it is included in the post-scan batch (DB query at end), not a mid-scan live locate storm

### Scan shape (pagination required)

Root can be huge → **must page** `fs/list` on root.

```text
page root (refresh:true on first page only):
  for each entry:
    if archive file under root → index as file (depth 1)
    if directory → index dir (depth 1), then list dir pages (refresh:false):
      index zip/cbz children (depth 2)
```

Controls:

- `per_page` 50–100
- serial page walks
- soft max list calls / max entries (configurable constants)
- persist all entries for matching (not only “preview”)

Reuse `cloud_scan_sessions` / `cloud_scan_entries` **or** add dedicated:

- `openlist_library_index_sessions`
- `openlist_library_index_entries`

**Recommendation:** dedicated tables keyed by root, not tied to `comicResourceId` (existing cloud scan is resource-centric and only depth-1 preview pages). Cleaner than forcing cloud-scan API.

### Matching against index (not live thrash)

After index ready:

- Hints: comic title, resource displayLabel
- Prefer exact normalize match on **directory name** or **file name**
- Resolve archive path:
  - matched dir → pick best zip/cbz under that dir from index
  - matched loose zip → use that path
- Unique high-confidence → transfer
- Ambiguous → fail with candidate paths
- None → fail with “index 中未找到；可手动移动后重新扫描/重试”

### Task state for pending recovery

Options:

**A (minimal schema change):** keep `status=failed`, set `errorMessage` prefix/code tag like `[10008] pending_index_recovery` + optional column later  
**B (clearer):** add status `awaiting_remote_index` or `duplicate_pending` to `download_tasks.status`

**Recommendation:** **B if enum migration is easy**; else A with structured `errorMessage` JSON/code prefix and a query helper `listPendingDuplicateRecoveryTasks()`.

Also store `openlistErrorCode=10008` if we add a column; otherwise encode in error message as `[openlist:10008]`.

### Batch recovery after scan

```ts
async function batchRecoverPendingDuplicateTasks(root: string): Promise<BatchRecoverResult>
```

- Query all offline openlist tasks pending recovery
- Match each against latest completed index for root
- Create transfer with zip path (idempotent)
- Dispatch transfers (bounded concurrency, e.g. 1–3)
- Summary for logs/UI: recovered / ambiguous / not_found counts

### Manual / worker triggers

- Automatic: on 10008 enqueue + ensure scan + post-scan batch
- Worker tick (optional): if pending recovery tasks exist and index completed, run batch (safety net)
- Admin: “扫描云端库并恢复 10008 任务” button later (out of MVP if automatic works)

---

## File Map

| File | Responsibility |
|------|----------------|
| `providers/openlist/connection.ts` | Harden nested code extraction; P0/P1/P2 classifier; always set `openlistCode` |
| `openlist-duplicate-error.ts` (new, pure) | `extractOpenListErrorCode`, `isDuplicateOfflineCode` unit-tested |
| `openlist-library-index.ts` (new) | Single-flight scan, pagination, persist index, getLatestIndex |
| `openlist-duplicate-recover.ts` (new or split from index.ts) | Enqueue pending, match index, batch recover, create transfer |
| `modules/downloads/index.ts` | Wire magnet submit 10008 → enqueue + ensureScan + (if index ready) batch |
| `modules/core/db/schema.ts` + bootstrap | Index session/entry tables or status enum extension |
| offline worker tick (optional) | Drain pending recovery when index completed |
| tests | classifier, scan single-flight, batch recover |
| docs | plan.md / implemented-features.md |

---

## Detailed Behavior

### 1) Classify 10008 (structured-first)

```ts
function extractOpenListErrorCode(payload: unknown, httpStatus?: number): number | null
function isOpenListDuplicateOfflineError(input: {
  code: number | null;
  message: string | null;
}): boolean {
  const code = input.code ?? extractCodeFromMessage(input.message);
  if (code === 10008) return true;
  // weak fallback only if message has 10008 AND existence keywords
  ...
}
```

On submit fail path: always parse `openlistCode` from payload + nested message.

### 2) On 10008 in `dispatchTaskNow`

```ts
if (result.status === "duplicate_task") {
  await enqueueDuplicateOfflineRecovery(task, result);
  await ensureOpenListLibraryIndexAndRecover(DEFAULT_ROOT);
  return `${task.comicTitle}: 任务已存在(10008)，已加入云端库恢复队列`;
}
```

`enqueueDuplicateOfflineRecovery`:

- mark task failed/pending with code 10008 (not raw-only message)
- **do not** live-locate here if index missing/running

### 3) `ensureOpenListLibraryIndexAndRecover(root)`

```
lock(root):
  if runningSession: return { joined: true, sessionId }
  if usableCompletedSession (MVP: any completed for root; later TTL):
    await batchRecoverPendingDuplicateTasks(root)
    return
  start session running
  scan paginated (async function, awaited in create path OR background)

MVP choice: **await scan in the request that starts it** (simpler, may be long).
Better UX: start scan async + return quickly; worker/offline-tick finishes batch.

**Locked for reliability + UX:**
- Scan runs **in background** (non-blocking HTTP): mark session running, finish via in-process continuation and/or worker tick, then atchRecover.
- Concurrent callers see running and only enqueue.
- Index **TTL** (default 10 min): no auto-rescan inside TTL even on not-found; **manual scan** bypasses TTL.

### 4) Scan implementation

- `listOpenListDirectory(path, { page, perPage, refresh })` already supports refresh.
- Root: page=1..N, `refresh: page===1`.
- For each directory entry: page children, store zip/cbz.
- Write entries in transaction chunks.
- Mark session completed/failed.

### 5) Match + transfer

Reuse scoring from `openlist-duplicate-locate.ts` against **index rows** (in-memory from DB), not live list.

`createTransferTaskFromResolvedRemoteFile` already exists in downloads index — reuse.

### 6) Retry path

Retry of pending/failed 10008:

- Do **not** re-submit magnet first if error is still known 10008 and index exists → recover from index
- If user forces retry submit and gets 10008 again → enqueue again (idempotent)

---

## Tasks

### Task 1: Structured 10008 extraction (pure + wire)

**Files:** `openlist-duplicate-error.ts`, `connection.ts`, tests

- [ ] Implement `extractOpenListErrorCode` (top-level + nested message `code:\s*(\d+)`)
- [ ] Change classifier to code-first; remove Chinese-only match
- [ ] Unit tests: code 10008; wrapped message 10008; chinese-only false; other codes false
- [ ] Ensure submit result `status=duplicate_task` + `openlistCode=10008`

### Task 2: DB index tables + pending recovery query

**Files:** schema, bootstrap, small helpers

- [ ] Add `openlist_library_index_sessions` / `openlist_library_index_entries` (or approved reuse)
- [ ] Session: rootPath, status running|completed|failed, counts, timestamps
- [ ] Entry: sessionId, remotePath, parentPath, name, kind file|directory, depth, sizeBytes
- [ ] Helper: `getRunningIndexSession(root)`, `getLatestCompletedIndexSession(root)`, `listIndexArchives(sessionId)`
- [ ] Helper: `listPendingDuplicateRecoveryTasks()`

### Task 3: Single-flight paginated scanner

**Files:** `openlist-library-index.ts`, tests with injected listDirectory

- [ ] `ensureOpenListLibraryIndex(root)` single-flight
- [ ] Paginate root + child dirs
- [ ] Persist entries
- [ ] Test: second ensure while running does not start second scan
- [ ] Test: multi-page root merges entries

### Task 4: Batch recover from index

**Files:** recover module, downloads index wire

- [ ] Match pending tasks to index archives
- [ ] Create transfer with zip path; mark offline completed
- [ ] Ambiguous/not found messages in Chinese
- [ ] After scan complete automatically call batch recover
- [ ] Tests: one scan recovers multiple pending 10008 tasks

### Task 5: Replace live-only recover in dispatchTaskNow

**Files:** `modules/downloads/index.ts`

- [ ] 10008 → enqueue + ensureIndex (non-blocking scan + then batch)
- [ ] Remove or demote per-task live full-tree thrash as primary path
- [ ] Optional: if completed index already present, recover immediately synchronously for that task

### Task 6: Safety net tick + docs

- [ ] offline worker or download tick: if pending recovery && completed index → batchRecover
- [ ] Update docs/plan.md + implemented-features.md
- [ ] Update this plan status when done

---

## Test Plan

1. Classifier unit tests (code-first)
2. Scanner pagination + single-flight
3. Enqueue two 10008 tasks while scan running → one session; both recovered after complete
4. Index hit → transfer remotePath ends with `.zip`/`.cbz`
5. Index miss → failed message mentions root + 扫描/重试
6. Regression: normal offline submit still once; non-10008 failures unchanged
7. Manual: real OpenList root with 2 known folders

---

## Out of Scope

- Author-level directory layout
- OpenList `fs/search` API
- Changing offline save path from `/115Open/Temp`
- Auto-pick among ambiguous low-confidence matches
- Full admin UI for index browser (optional later)
- Physical moves on 115

---

## Implementation Order

1. Structured code extraction  
2. Index schema + scanner single-flight  
3. Batch recover  
4. Wire dispatchTaskNow  
5. Worker safety net + docs  

---

## Open Decisions (defaults locked unless user overrides)

| Topic | Default |
|-------|---------|
| Index storage | Dedicated library index tables |
| Scan on first 10008 | Auto start single-flight |
| Concurrent 10008 during scan | Enqueue only; batch after |
| Scan blocking HTTP | Non-blocking (`void` run + tick/batch) |
| Index TTL | **Configurable** (default e.g. 10 minutes). Within TTL, reuse last completed index; do **not** auto-rescan even if match not found |
| Forced rescan | **Manual scan button** always allowed (admin), ignores TTL |
| Auto-rescan when | No completed index, or completed index older than TTL, or manual trigger |
| Chinese-only match | **Disabled** |
| Scan vs HTTP request | **Background single-flight** (non-blocking): request returns after enqueue; scan+batch continue in process / worker |

---

## User-facing messages (examples)

- Enqueued: `OpenList 任务已存在(10008)。已加入云端库恢复队列，等待/使用 /115Open/HENTAI/exhentai 索引后自动拉回。`
- Recovered: `已从云端库索引定位到 xxx.zip，已创建传输任务。`
- Not found: `10008：云端库索引中未找到匹配漫画。请确认文件在 /115Open/HENTAI/exhentai/[漫画名]/ 下后重试（将触发/复用扫描）。`

---

## Relation to previous plan

Supersedes the **live-only per-task locate** as the primary recovery path in `2026-07-15-openlist-duplicate-offline-locate.md`.  
Keep locate scoring helpers; use them against **index rows**. Live locate may remain as optional fallback only if index empty and scan failed — not default.

---

## User decisions (2026-07-16 follow-up)

### Index TTL (locked)

- Setting: e.g. `openlistLibraryIndexTtlMinutes` (default **10**).
- After a **completed** scan for `/115Open/HENTAI/exhentai`:
  - Within TTL: **reuse index**; do **not** start another auto-scan.
  - Even if a 10008 task **cannot find** a match in the index, **still wait until TTL expires** before auto-scan again.
- **Manual scan** (admin button / API): **always allowed**, bypasses TTL, still single-flight (if a scan is already running, join/wait, do not start a second concurrent scan).
- Auto-scan starts only when:
  1. no completed index for root, or
  2. last completed index age ≥ TTL, or
  3. user clicks manual scan.

### Blocking vs background scan — meaning (for implementers + user)

Two ways to run the (possibly long) `fs/list` walk:

| Mode | What happens when a 10008 hits | User / HTTP experience |
|------|----------------------------------|-------------------------|
| **Blocking** | Request thread **waits** until entire root scan finishes, then matches and creates transfer, then returns | Plugin/create API may hang **minutes** if library is large; browser/plugin looks “卡住” |
| **Background (chosen)** | Request **quickly** marks task as “待云端库恢复”, starts/joins single-flight scan, returns message immediately; when scan completes, **batch pull** runs | Create/retry returns fast; downloads list later shows transfer created or not-found |

**Chosen: background single-flight.**  
Reason: avoid hanging plugin/admin HTTP; same single-flight rules still apply.

Flow under background mode:

```text
10008
  → enqueue task (pending recovery)
  → if no usable index (none or TTL expired) and no running scan → start background scan
  → if running scan → only enqueue
  → if usable index within TTL → batch-match immediately (no scan)
  → HTTP returns: “已加入恢复队列…”
  → (later) scan done → batchRecover all pending
```

Manual scan:

```text
User clicks “扫描云端库”
  → ignore TTL
  → single-flight scan (if already running, show “扫描中”)
  → on complete → batchRecover pending 10008 tasks
```
