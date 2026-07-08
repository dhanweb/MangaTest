import type { DownloadProviderAdapter } from "../types";

import { inspectOpenListResource } from "./connection";

export { checkOpenListConnection, hashOpenListPassword, inspectOpenListResource, loginOpenList, normalizeOpenListResourcePath } from "./connection";
export type {
  OpenListConnectionCheckResult,
  OpenListConnectionStatus,
  OpenListEndpointCheck,
  OpenListLoginInput,
  OpenListLoginResult,
  OpenListLoginStatus,
  OpenListRemoteResource,
  OpenListResourceProbeResult,
  OpenListResourceProbeStatus,
} from "./connection";

export const openlistProviderAdapter: DownloadProviderAdapter = {
  provider: "openlist",
  label: "OpenList",
  supportedResourceTypes: ["openlist"],
  async prepare({ resource, settings }) {
    if (!settings.openlistEnabled) {
      return {
        canDispatch: false,
        code: "provider_disabled",
        reason: "OpenList provider 尚未在设置中启用。",
      };
    }

    const missingSettings = [
      settings.openlistBaseUrl.trim() ? null : "openlistBaseUrl",
      settings.openlistToken.trim() ? null : "openlistToken",
    ].filter((value): value is string => Boolean(value));

    if (missingSettings.length > 0) {
      return {
        canDispatch: false,
        code: "missing_settings",
        missingSettings,
        reason: "OpenList provider 缺少必要连接设置。",
      };
    }

    if (!resource.resourceUrl) {
      return {
        canDispatch: false,
        code: "missing_resource",
        reason: "资源缺少 OpenList 路径或下载标识。",
      };
    }

    const remoteResource = await inspectOpenListResource(resource.resourceUrl, { settings });

    if (remoteResource.status === "not_found") {
      return {
        canDispatch: false,
        code: "remote_resource_not_found",
        reason: remoteResource.message,
      };
    }

    if (!remoteResource.ok || !remoteResource.resource) {
      return {
        canDispatch: false,
        code: "remote_resource_unavailable",
        reason: remoteResource.message,
      };
    }

    const details = {
      rawUrlAvailable: remoteResource.resource.rawUrlAvailable,
      remoteIsDirectory: remoteResource.resource.isDirectory,
      remoteName: remoteResource.resource.name,
      remoteProvider: remoteResource.resource.provider,
      remoteSizeBytes: remoteResource.resource.sizeBytes,
    };

    if (remoteResource.resource.isDirectory) {
      return {
        canDispatch: false,
        code: "remote_resource_directory",
        details,
        reason: `OpenList 路径是目录：${remoteResource.resource.name}。后续需要进入云端目录扫描流程。`,
      };
    }

    if (!remoteResource.resource.rawUrlAvailable) {
      return {
        canDispatch: false,
        code: "remote_resource_missing_link",
        details,
        reason: `OpenList 文件可访问：${formatRemoteResource(remoteResource.resource)}，但暂未返回 raw_url。`,
      };
    }

    return {
      canDispatch: false,
      code: "provider_not_implemented",
      details,
      reason: `OpenList 文件可访问：${formatRemoteResource(remoteResource.resource)}。真实下载执行尚未接入。`,
    };
  },
};

function formatRemoteResource(resource: { name: string; provider: string | null; sizeBytes: number | null }) {
  const parts = [resource.name];

  if (resource.sizeBytes != null) {
    parts.push(formatBytes(resource.sizeBytes));
  }

  if (resource.provider) {
    parts.push(resource.provider);
  }

  return parts.join(" · ");
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
