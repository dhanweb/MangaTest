import type { DownloadProviderAdapter } from "../types";

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

    return {
      canDispatch: false,
      code: "provider_not_implemented",
      reason: "OpenList provider 执行尚未接入；当前 worker 只进行调度预检。",
    };
  },
};
