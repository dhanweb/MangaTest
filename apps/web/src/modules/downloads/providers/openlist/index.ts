import type { DownloadProviderAdapter, DownloadProviderReadiness } from "../types";

import { inspectOpenListResource, listOpenListDirectory } from "./connection";

export {
  checkOpenListConnection,
  ensureOpenListToken,
  hashOpenListPassword,
  inspectOpenListResource,
  listOpenListDirectory,
  listOpenListOfflineTasks,
  loginOpenList,
  normalizeOpenListResourcePath,
  resolveOpenListDownloadLink,
  submitOpenListOfflineDownload,
} from "./connection";
export type {
  OpenListAuthRefreshResult,
  OpenListConnectionCheckResult,
  OpenListConnectionStatus,
  OpenListDownloadLinkResult,
  OpenListDirectoryListResult,
  OpenListDirectoryListStatus,
  OpenListDirectorySnapshot,
  OpenListEndpointCheck,
  OpenListLoginInput,
  OpenListLoginResult,
  OpenListLoginStatus,
  OpenListOfflineDownloadResult,
  OpenListOfflineDownloadStatus,
  OpenListOfflineTaskItem,
  OpenListRemoteResource,
  OpenListResourceProbeResult,
  OpenListResourceProbeStatus,
} from "./connection";

export const openlistProviderAdapter: DownloadProviderAdapter = {
  provider: "openlist",
  label: "OpenList",
  supportedResourceTypes: ["openlist", "magnet"],
  async prepare({ resource, settings }) {
    if (!settings.openlistEnabled) {
      return { canDispatch: false, code: "provider_disabled", reason: "OpenList provider 尚未在设置中启用。" };
    }

    const hasSavedLogin = Boolean(settings.openlistUsername.trim() && settings.openlistPassword);
    const missingSettings = [
      settings.openlistBaseUrl.trim() ? null : "openlistBaseUrl",
      settings.openlistToken.trim() || hasSavedLogin ? null : "openlistToken",
    ].filter((v): v is string => Boolean(v));

    if (missingSettings.length > 0) {
      return { canDispatch: false, code: "missing_settings", missingSettings, reason: "OpenList provider 缺少必要连接设置。" };
    }

    // Magnet resources: push to OpenList offline download
    if (resource.resourceType === "magnet") {
      if (!resource.resourceUrl) {
        return { canDispatch: false, code: "missing_resource", reason: "磁链资源缺少 URL。" } satisfies DownloadProviderReadiness;
      }
      return {
        canDispatch: true,
        code: "ready",
        reason: "磁链将推送到 OpenList 离线下载。",
      } satisfies DownloadProviderReadiness;
    }

    // OpenList file resources: probe remote path
    if (!resource.resourceUrl) {
      return { canDispatch: false, code: "missing_resource", reason: "资源缺少 OpenList 路径或下载标识。" };
    }

    const remoteResource = await inspectOpenListResource(resource.resourceUrl, { settings });
    const remotePathDetails: Record<string, string> | undefined = remoteResource.path ? { remotePath: remoteResource.path } : undefined;

    if (remoteResource.status === "not_found") {
      return { canDispatch: false, code: "remote_resource_not_found", details: remotePathDetails, reason: remoteResource.message };
    }

    if (!remoteResource.ok || !remoteResource.resource) {
      return { canDispatch: false, code: "remote_resource_unavailable", details: remotePathDetails, reason: remoteResource.message };
    }

    const details = {
      ...(remotePathDetails ?? {}),
      rawUrlAvailable: remoteResource.resource.rawUrlAvailable,
      remoteIsDirectory: remoteResource.resource.isDirectory,
      remoteName: remoteResource.resource.name,
      remoteProvider: remoteResource.resource.provider,
      remoteSizeBytes: remoteResource.resource.sizeBytes,
    };

    if (remoteResource.resource.isDirectory) {
      const directory = await listOpenListDirectory(remoteResource.path, { perPage: 10, settings });
      const dirDetails = directory.directory ? getDirectoryDetails(directory.directory) : {};
      return {
        canDispatch: false, code: "remote_resource_directory",
        details: { ...details, ...dirDetails },
        reason: directory.ok
          ? `OpenList 路径是目录：${remoteResource.resource.name}，已列举 ${directory.directory?.entries.length ?? 0} 个预览项。`
          : `OpenList 路径是目录：${remoteResource.resource.name}，目录列表暂不可读。`,
      };
    }

    if (!remoteResource.resource.rawUrlAvailable) {
      return { canDispatch: false, code: "remote_resource_missing_link", details, reason: `OpenList 文件可访问：${formatResource(remoteResource.resource)}，但暂未返回 raw_url。` };
    }

    return {
      canDispatch: true, code: "ready", details,
      reason: `OpenList 文件可访问：${formatResource(remoteResource.resource)}，可以下载到本地临时文件。`,
    };
  },
};

function formatResource(r: { name: string; provider: string | null; sizeBytes: number | null }) {
  const parts = [r.name];
  if (r.sizeBytes != null) parts.push(formatBytes(r.sizeBytes));
  if (r.provider) parts.push(r.provider);
  return parts.join(" · ");
}

function formatBytes(v: number) {
  if (v < 1024) return `${v} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = v / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i += 1; }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[i]}`;
}

function getDirectoryDetails(d: { entries: Array<{ isDirectory: boolean; name: string }>; total: number | null }) {
  const dirs = d.entries.filter((e) => e.isDirectory).length;
  const files = d.entries.length - dirs;
  return {
    remoteChildCount: d.total ?? d.entries.length,
    remoteDirectoryCount: dirs,
    remoteFileCount: files,
    remotePreviewNames: d.entries.slice(0, 3).map((e) => e.name).join("、") || null,
  };
}
