import { describe, expect, it } from "vitest";

import {
  extractCodeFromMessage,
  extractOpenListErrorCode,
  isOpenListDuplicateOfflineError,
  isPendingDuplicateRecoveryError,
  isRecoverableDuplicateOfflineError,
  buildPendingDuplicateRecoveryMessage,
  buildIndexNotFoundMessage,
  buildIndexAmbiguousMessage,
  OPENLIST_DUPLICATE_OFFLINE_CODE,
  PENDING_DUPLICATE_RECOVERY_TAG,
} from "./openlist-duplicate-error";

describe("openlist-duplicate-error", () => {
  it("extracts nested code from message", () => {
    expect(
      extractCodeFromMessage("failed to add offline download task: code: 10008, message: 任务已存在"),
    ).toBe(10008);
    expect(extractCodeFromMessage("code: 500")).toBe(500);
    expect(extractCodeFromMessage("no code here")).toBeNull();
  });

  it("extracts top-level or nested code from payload", () => {
    expect(extractOpenListErrorCode({ code: 10008, message: "任务已存在" })).toBe(10008);
    expect(
      extractOpenListErrorCode({
        code: 500,
        message: "failed: code: 10008, message: 任务已存在，请勿输入重复的链接地址",
      }),
    ).toBe(10008);
    expect(extractOpenListErrorCode({ code: 200, message: "ok" })).toBe(200);
    expect(extractOpenListErrorCode(null)).toBeNull();
  });

  it("classifies duplicate with code-first rules", () => {
    expect(isOpenListDuplicateOfflineError({ code: 10008, message: "x" })).toBe(true);
    expect(
      isOpenListDuplicateOfflineError({
        code: 500,
        message: "failed to add offline download task: code: 10008, message: 任务已存在",
      }),
    ).toBe(true);
    expect(isOpenListDuplicateOfflineError({ code: 200, message: "ok" })).toBe(false);
    // Chinese-only without 10008 must be false
    expect(isOpenListDuplicateOfflineError({ code: 500, message: "任务已存在，请勿输入重复的链接地址" })).toBe(false);
    // Weak fallback: 10008 + keyword
    expect(isOpenListDuplicateOfflineError({ code: null, message: "error 10008 任务已存在" })).toBe(true);
  });

  it("pending recovery tag helpers", () => {
    const msg = buildPendingDuplicateRecoveryMessage("/115Open/HENTAI/exhentai");
    expect(msg).toContain(PENDING_DUPLICATE_RECOVERY_TAG);
    expect(isPendingDuplicateRecoveryError(msg)).toBe(true);
    expect(isPendingDuplicateRecoveryError("plain fail")).toBe(false);
    expect(OPENLIST_DUPLICATE_OFFLINE_CODE).toBe(10008);
  });

  it("index miss/ambiguous messages do not look like OpenList 10008", () => {
    const miss = buildIndexNotFoundMessage("/115Open/HENTAI/exhentai", {
      comicName: "[作者]真实漫画标题",
      hints: ["[作者] 别的资源标签.zip"],
    });
    const amb = buildIndexAmbiguousMessage("/115Open/HENTAI/exhentai", ["/a/b.zip"], {
      comicName: "[作者]真实漫画标题",
    });
    expect(miss).not.toMatch(/10008/);
    expect(amb).not.toMatch(/10008/);
    expect(miss).toContain("[作者]真实漫画标题");
    // 115: folder name includes .zip (from comic title), file inside same name — not resource-label variant
    expect(miss).toContain(
      "/115Open/HENTAI/exhentai/[作者]真实漫画标题.zip/[作者]真实漫画标题.zip",
    );
    expect(isRecoverableDuplicateOfflineError(miss)).toBe(false);
    expect(isRecoverableDuplicateOfflineError(amb)).toBe(false);
  });
});
