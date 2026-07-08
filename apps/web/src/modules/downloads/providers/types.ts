import type { RuntimeSettings } from "@/modules/core/settings";

import type { ComicResourceType, DownloadProvider, DownloadTaskRecord } from "../index";

export type DownloadProviderReadinessCode =
  | "ready"
  | "provider_disabled"
  | "provider_not_implemented"
  | "missing_settings"
  | "missing_resource"
  | "incompatible_resource"
  | "remote_resource_directory"
  | "remote_resource_missing_link"
  | "remote_resource_not_found"
  | "remote_resource_unavailable";

export interface DownloadProviderResourceSnapshot {
  id: string;
  comicId: string | null;
  comicTitle: string;
  resourceType: ComicResourceType;
  displayLabel: string;
  redactedResource: string;
  resourceUrl: string | null;
  sourceSite: string | null;
}

export interface DownloadProviderPrepareInput {
  task: DownloadTaskRecord;
  resource: DownloadProviderResourceSnapshot;
  settings: RuntimeSettings;
}

export interface DownloadProviderReadiness {
  canDispatch: boolean;
  code: DownloadProviderReadinessCode;
  reason: string;
  missingSettings?: string[];
  details?: Record<string, boolean | number | string | null>;
}

export interface DownloadProviderAdapter {
  provider: DownloadProvider;
  label: string;
  supportedResourceTypes: ComicResourceType[];
  prepare(input: DownloadProviderPrepareInput): Promise<DownloadProviderReadiness>;
}
