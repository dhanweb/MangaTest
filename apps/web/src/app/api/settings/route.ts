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

  return Response.json({ settings: await saveRuntimeSettings(input) });
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}
