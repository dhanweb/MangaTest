import type { DownloadProviderAdapter } from "../types";

export const aria2ProviderAdapter: DownloadProviderAdapter = {
  provider: "aria2",
  label: "aria2",
  supportedResourceTypes: ["magnet", "torrent"],
  async prepare({ resource }) {
    if (!resource.resourceUrl) {
      return {
        canDispatch: false,
        code: "missing_resource",
        reason: "资源缺少可交给 aria2 的下载地址。",
      };
    }

    return {
      canDispatch: false,
      code: "provider_not_implemented",
      reason: "aria2 provider 执行尚未接入；当前 worker 只进行调度预检。",
    };
  },
};
