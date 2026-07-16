/**
 * Structured OpenList offline error classification (10008 duplicate task).
 * Prefer numeric codes over Chinese full-text matching.
 */

export const OPENLIST_DUPLICATE_OFFLINE_CODE = 10008;

export const PENDING_DUPLICATE_RECOVERY_TAG = "[openlist:10008] pending_index_recovery";
export const INDEX_NOT_FOUND_TAG = "[openlist:index_not_found]";
export const INDEX_AMBIGUOUS_TAG = "[openlist:index_ambiguous]";

/** Extract nested `code: N` from OpenList/115 error messages. */
export function extractCodeFromMessage(message: string | null | undefined): number | null {
  const text = String(message ?? "");
  const match = text.match(/code:\s*(\d+)\b/i);
  if (!match?.[1]) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

/**
 * Resolve OpenList error code from payload + optional HTTP status.
 * Priority: top-level payload.code → nested message code → null.
 */
export function extractOpenListErrorCode(
  payload: unknown,
  _httpStatus?: number | null,
): number | null {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.code === "number" && Number.isFinite(record.code)) {
      // Outer 500 with nested 10008 in message is common; still return top-level first,
      // callers combine with nested extraction for duplicate detection.
      if (record.code === OPENLIST_DUPLICATE_OFFLINE_CODE) return OPENLIST_DUPLICATE_OFFLINE_CODE;
      if (record.code !== 200 && record.code !== 0) {
        const nested = extractCodeFromMessage(typeof record.message === "string" ? record.message : null);
        if (nested != null) return nested;
        return record.code;
      }
      return record.code;
    }
    if (typeof record.message === "string") {
      const nested = extractCodeFromMessage(record.message);
      if (nested != null) return nested;
    }
  }
  return null;
}

export function isOpenListDuplicateOfflineError(input: {
  code?: number | null;
  message?: string | null;
}): boolean {
  const top = input.code ?? null;
  if (top === OPENLIST_DUPLICATE_OFFLINE_CODE) return true;

  const nested = extractCodeFromMessage(input.message);
  if (nested === OPENLIST_DUPLICATE_OFFLINE_CODE) return true;

  // Weak fallback: must include 10008 AND existence keywords (never Chinese-only).
  const text = String(input.message ?? "");
  if (/\b10008\b/.test(text) && (/任务已存在/.test(text) || /重复的链接/.test(text) || /duplicate/i.test(text))) {
    return true;
  }
  return false;
}

/** Legacy two-arg form used by older call sites. */
export function isOpenListDuplicateOfflineErrorLegacy(
  code: number | null | undefined,
  message: string | null | undefined,
): boolean {
  return isOpenListDuplicateOfflineError({ code, message });
}

export function buildPendingDuplicateRecoveryMessage(root: string): string {
  return (
    `${PENDING_DUPLICATE_RECOVERY_TAG}|` +
    `OpenList 任务已存在(10008)。已加入云端库恢复队列，等待/使用 ${root} 索引后自动拉回。`
  );
}

export function isPendingDuplicateRecoveryError(errorMessage: string | null | undefined): boolean {
  return String(errorMessage ?? "").includes(PENDING_DUPLICATE_RECOVERY_TAG);
}

/**
 * True when a failed offline task should enter (or re-enter) library-index recovery.
 * Covers both our pending tag and raw OpenList 10008 messages written by older poll/submit paths.
 */
export function isRecoverableDuplicateOfflineError(errorMessage: string | null | undefined): boolean {
  if (isPendingDuplicateRecoveryError(errorMessage)) return true;
  return isOpenListDuplicateOfflineError({ code: null, message: errorMessage });
}

/** Tasks eligible for manual rescan re-match (pending 10008 + previous index miss/ambiguous). */
export function isLibraryIndexRematchCandidateError(errorMessage: string | null | undefined): boolean {
  const text = String(errorMessage ?? "");
  if (isRecoverableDuplicateOfflineError(text)) return true;
  if (text.includes(INDEX_NOT_FOUND_TAG) || text.includes(INDEX_AMBIGUOUS_TAG)) return true;
  return false;
}

function pickComicDisplayName(comicName?: string | null, hints?: string[]): string | null {
  const fromName = comicName?.trim();
  if (fromName) return fromName;
  for (const hint of hints ?? []) {
    const t = hint?.trim();
    if (t) return t;
  }
  return null;
}

/**
 * 115 offline often lands as:
 *   {root}/{fileName.zip}/{fileName.zip}
 * i.e. a folder named exactly like the archive (including .zip/.cbz), then the file inside.
 */
export function buildExpectedArchiveFileName(comicName?: string | null, hints?: string[]): string | null {
  // Prefer comic display title + .zip — 115 folder is usually that full archive name.
  const title = comicName?.trim();
  if (title) {
    if (/\.(zip|cbz)$/i.test(title)) return title;
    return `${title}.zip`;
  }
  for (const hint of hints ?? []) {
    const t = hint?.trim();
    if (t && /\.(zip|cbz)$/i.test(t)) return t;
  }
  const name = pickComicDisplayName(null, hints);
  if (!name) return null;
  if (/\.(zip|cbz)$/i.test(name)) return name;
  return `${name}.zip`;
}

/** Expected layout example: 115 same-name directory + archive file. */
export function buildExpectedLibraryPathExample(root: string, comicName?: string | null, hints?: string[]): string {
  const archiveName = buildExpectedArchiveFileName(comicName, hints);
  if (archiveName) return `${root}/${archiveName}/${archiveName}`;
  return `${root}/<文件名>.zip/<文件名>.zip`;
}

/** Final state after index recovery failed to match — do not include 10008 (not re-queued as duplicate recovery). */
export function buildIndexNotFoundMessage(
  root: string,
  options?: { comicName?: string | null; hints?: string[] },
): string {
  const example = buildExpectedLibraryPathExample(root, options?.comicName, options?.hints);
  const name = pickComicDisplayName(options?.comicName, options?.hints);
  const namePart = name ? `「${name}」` : "该漫画";
  return (
    `${INDEX_NOT_FOUND_TAG} 云端库索引中未找到与${namePart}匹配的压缩包。` +
    `115 常见路径为「与 zip 同名的目录/同名 zip」，例如 ${example}。请放到该位置后，在下载页点「重扫云端库」再试。`
  );
}

export function buildIndexRecoveredMessage(fileName: string): string {
  return `已从云端库索引定位到 ${fileName}，已创建传输任务。`;
}

/** Final state when multiple candidates match — no 10008 so UI/retry won't treat as raw OpenList duplicate. */
export function buildIndexAmbiguousMessage(
  root: string,
  paths: string[],
  options?: { comicName?: string | null },
): string {
  const preview = paths.slice(0, 5).join("；");
  const name = pickComicDisplayName(options?.comicName);
  const namePart = name ? `「${name}」` : "该漫画";
  return (
    `${INDEX_AMBIGUOUS_TAG} 云端库索引中为${namePart}找到多个相似路径：${preview}。` +
    `请整理 ${root} 下目录名称避免重名，确认唯一路径后点「重扫云端库」。`
  );
}
