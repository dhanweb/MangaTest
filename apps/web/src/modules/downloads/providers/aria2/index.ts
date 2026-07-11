import type { DownloadProviderAdapter } from "../types";

export const aria2ProviderAdapter: DownloadProviderAdapter = {
  provider: "aria2",
  label: "aria2",
  supportedResourceTypes: ["magnet", "torrent"],
  async prepare({ resource, settings }) {
    if (!settings.aria2Enabled) {
      return {
        canDispatch: false,
        code: "provider_disabled",
        reason: "aria2 provider 尚未在设置中启用。",
      };
    }

    if (!settings.aria2RpcUrl) {
      return {
        canDispatch: false,
        code: "missing_settings",
        missingSettings: ["aria2RpcUrl"],
        reason: "aria2 provider 缺少 RPC 地址配置。",
      };
    }

    if (!resource.resourceUrl) {
      return {
        canDispatch: false,
        code: "missing_resource",
        reason: "资源缺少可交给 aria2 的下载地址。",
      };
    }

    return {
      canDispatch: true,
      code: "ready",
      reason: "aria2 RPC 已配置。",
      details: {
        aria2RpcUrl: settings.aria2RpcUrl,
      },
    };
  },
};
