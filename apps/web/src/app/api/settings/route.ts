import path from "node:path";

import { getRuntimeSettings, saveRuntimeSettings } from "@/modules/core/settings";
import type { RuntimeSettingsInput } from "@/modules/core/settings/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ settings: await getRuntimeSettings() });
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  const input: RuntimeSettingsInput = {};

  if (typeof payload.listenHost === "string") {
    input.listenHost = payload.listenHost;
  }

  if (typeof payload.cacheDirectory === "string") {
    input.cacheDirectory = payload.cacheDirectory;
  }

  if (typeof payload.cacheSizeMb === "number") {
    input.cacheSizeMb = clampNumber(payload.cacheSizeMb, 16, 1024 * 1024);
  }

  if (typeof payload.readerThumbnailTtlDays === "number") {
    input.readerThumbnailTtlDays = clampNumber(payload.readerThumbnailTtlDays, 1, 3650);
  }

  if (typeof payload.readerPreloadEnabled === "boolean") {
    input.readerPreloadEnabled = payload.readerPreloadEnabled;
  }

  if (typeof payload.readerPreloadAheadPages === "number") {
    input.readerPreloadAheadPages = clampNumber(payload.readerPreloadAheadPages, 0, 12);
  }

  if (typeof payload.readerThumbnailSidebarDefault === "boolean") {
    input.readerThumbnailSidebarDefault = payload.readerThumbnailSidebarDefault;
  }

  if (typeof payload.readerImmersiveDefault === "boolean") {
    input.readerImmersiveDefault = payload.readerImmersiveDefault;
  }

  if (payload.themeMode === "system" || payload.themeMode === "light" || payload.themeMode === "dark") {
    input.themeMode = "light";
  }

  if (typeof payload.metadataImportToken === "string") {
    input.metadataImportToken = payload.metadataImportToken.trim();
  }

  if (typeof payload.downloadDefaultTargetDirectory === "string") {
    const normalizedDownloadTarget = normalizeOptionalAbsolutePath(payload.downloadDefaultTargetDirectory);
    if (normalizedDownloadTarget.error) {
      return Response.json({ error: normalizedDownloadTarget.error }, { status: 400 });
    }
    input.downloadDefaultTargetDirectory = normalizedDownloadTarget.value;
  }

  if (typeof payload.openlistEnabled === "boolean") {
    input.openlistEnabled = payload.openlistEnabled;
  }

  if (typeof payload.openlistBaseUrl === "string") {
    const normalizedOpenListBaseUrl = normalizeOptionalHttpUrl(payload.openlistBaseUrl);
    if (normalizedOpenListBaseUrl.error) {
      return Response.json({ error: normalizedOpenListBaseUrl.error }, { status: 400 });
    }
    input.openlistBaseUrl = normalizedOpenListBaseUrl.value;
  }

  if (typeof payload.openlistToken === "string") {
    input.openlistToken = payload.openlistToken.trim();
  }

  if (typeof payload.openlistUsername === "string") {
    input.openlistUsername = payload.openlistUsername.trim();
  }

  if (typeof payload.openlistPassword === "string") {
    input.openlistPassword = payload.openlistPassword;
  }

  if (typeof payload.aria2Enabled === "boolean") {
    input.aria2Enabled = payload.aria2Enabled;
  }

  if (typeof payload.aria2RpcUrl === "string") {
    const normalized = normalizeOptionalHttpUrl(payload.aria2RpcUrl);
    if (normalized.error) {
      return Response.json({ error: normalized.error }, { status: 400 });
    }
    input.aria2RpcUrl = normalized.value;
  }

  if (typeof payload.aria2RpcToken === "string") {
    input.aria2RpcToken = payload.aria2RpcToken.trim();
  }

  try {
    return Response.json({ settings: await saveRuntimeSettings(input) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to save settings." }, { status: 400 });
  }
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeOptionalAbsolutePath(value: string) {
  const text = value.trim();

  if (!text) {
    return { value: "", error: null };
  }

  if (!path.isAbsolute(text)) {
    return { value: "", error: "默认下载目录必须是绝对路径。" };
  }

  return { value: path.normalize(text), error: null };
}

function normalizeOptionalHttpUrl(value: string) {
  const text = value.trim();

  if (!text) {
    return { value: "", error: null };
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { value: "", error: "OpenList 服务地址必须是 http 或 https URL。" };
    }
    return { value: url.toString(), error: null };
  } catch {
    return { value: "", error: "OpenList 服务地址必须是有效 URL。" };
  }
}
