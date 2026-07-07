import { aria2ProviderAdapter } from "./aria2";
import { builtinHttpProviderAdapter } from "./builtin-http";
import { openlistProviderAdapter } from "./openlist";
import type { DownloadProviderAdapter } from "./types";
import type { DownloadProvider } from "../index";

const DOWNLOAD_PROVIDER_ADAPTERS = [aria2ProviderAdapter, builtinHttpProviderAdapter, openlistProviderAdapter] satisfies DownloadProviderAdapter[];

const ADAPTERS_BY_PROVIDER: Record<DownloadProvider, DownloadProviderAdapter> = {
  "aria2": aria2ProviderAdapter,
  "builtin-http": builtinHttpProviderAdapter,
  "openlist": openlistProviderAdapter,
};

export function getDownloadProviderAdapter(provider: DownloadProvider) {
  return ADAPTERS_BY_PROVIDER[provider];
}

export function listDownloadProviderAdapters() {
  return [...DOWNLOAD_PROVIDER_ADAPTERS];
}
