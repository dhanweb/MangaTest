/**
 * Structured OpenList offline error classification (10008 duplicate task).
 * Prefer numeric codes over Chinese full-text matching.
 */

export const OPENLIST_DUPLICATE_OFFLINE_CODE = 10008;

export const PENDING_DUPLICATE_RECOVERY_TAG = "[openlist:10008] pending_index_recovery";

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

export function buildIndexNotFoundMessage(root: string): string {
  return (
    `[openlist:10008] 10008：云端库索引中未找到匹配漫画。` +
    `请确认文件在 ${root}/[漫画名]/ 下后重试（将触发/复用扫描）。`
  );
}

export function buildIndexRecoveredMessage(fileName: string): string {
  return `已从云端库索引定位到 ${fileName}，已创建传输任务。`;
}

export function buildIndexAmbiguousMessage(root: string, paths: string[]): string {
  const preview = paths.slice(0, 5).join("；");
  return (
    `[openlist:10008] OpenList 任务已存在(10008)，在 ${root} 索引中找到多个相似漫画：${preview}。` +
    "请手动确认正确路径后重试，或整理云端目录名称避免重名。"
  );
}
