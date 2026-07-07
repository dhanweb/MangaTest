import type { DownloadProviderAdapter } from "../types";

export const builtinHttpProviderAdapter: DownloadProviderAdapter = {
  provider: "builtin-http",
  label: "内置 HTTP",
  supportedResourceTypes: ["http"],
  async prepare({ resource }) {
    if (!resource.resourceUrl) {
      return {
        canDispatch: false,
        code: "missing_resource",
        reason: "资源缺少 HTTP 下载地址。",
      };
    }

    return {
      canDispatch: false,
      code: "provider_not_implemented",
      reason: "内置 HTTP provider 执行尚未接入；当前 worker 只进行调度预检。",
    };
  },
};
