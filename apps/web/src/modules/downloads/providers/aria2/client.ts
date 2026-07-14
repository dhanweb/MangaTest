import { rm } from "node:fs/promises";

let requestId = 0;

function buildPayload(method: string, params: unknown[]) {
  return {
    jsonrpc: "2.0",
    id: `aria2-${++requestId}`,
    method,
    params,
  };
}

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
  rpcToken?: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const tokenParam = rpcToken ? `token:${rpcToken}` : null;
  const allParams = tokenParam ? [tokenParam, ...params] : params;

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(method, allParams)),
    signal,
  });

  if (!res.ok) {
    throw new Error(`aria2 RPC 请求失败：HTTP ${res.status}`);
  }

  const body = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };

  if (body.error) {
    throw new Error(`aria2 RPC 错误 [${body.error.code}]：${body.error.message}`);
  }

  return body.result;
}

const aria2Gids = new Map<string, string>();
const aria2Canceled = new Set<string>();

export interface Aria2DownloadOptions {
  rpcUrl: string;
  rpcToken?: string;
  uri: string;
  dir: string;
  out?: string;
  taskId?: string;
  headers?: Record<string, string>;
  /**
   * OpenList/CDN 签名链接常拒绝多 Range 分片请求（会返回 403）。
   * 传 true 时使用单连接下载。
   */
  singleConnection?: boolean;
}

export type Aria2DownloadStatus = "active" | "waiting" | "paused" | "error" | "complete" | "removed";

export interface Aria2StatusResult {
  gid: string;
  status: Aria2DownloadStatus;
  totalLength: string;
  completedLength: string;
  downloadSpeed: string;
  files: Array<{
    path: string;
    length: string;
    completedLength: string;
  }>;
  errorCode?: string;
  errorMessage?: string;
}

export interface Aria2DownloadResult {
  success: boolean;
  gid: string;
  status: Aria2DownloadStatus;
  errorMessage?: string;
  files?: string[];
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TIME_MS = 3_600_000;

export async function downloadWithAria2(options: Aria2DownloadOptions): Promise<Aria2DownloadResult> {
  const { rpcUrl, rpcToken, uri, dir, out, taskId, headers, singleConnection } = options;
  const useSingleConnection = Boolean(singleConnection) || Boolean(headers && Object.keys(headers).length > 0);

  const addParams: Record<string, string | string[]> = {
    dir,
    "continue": "true",
    "max-connection-per-server": useSingleConnection ? "1" : "16",
    "split": useSingleConnection ? "1" : "16",
    "min-split-size": "1M",
    "max-tries": "0",
    "retry-wait": "5",
    "auto-file-renaming": "false",
    "allow-overwrite": "true",
  };

  if (out) {
    addParams.out = out;
  }

  if (uri.startsWith("magnet:")) {
    addParams["bt-save-metadata"] = "true";
  }

  if (headers && Object.keys(headers).length > 0) {
    // aria2 要求 header 为 "Name: value" 字符串数组
    addParams.header = Object.entries(headers).map(([k, v]) => `${k}: ${v}`);
  }

  try {
    const gid = (await rpcCall(rpcUrl, "aria2.addUri", [[uri], addParams], rpcToken)) as string;

    if (taskId) {
      aria2Gids.set(taskId, gid);
    }

    const deadline = Date.now() + MAX_POLL_TIME_MS;

    while (Date.now() < deadline) {
      if (taskId && aria2Canceled.has(taskId)) {
        aria2Canceled.delete(taskId);
        aria2Gids.delete(taskId);
        await rpcCall(rpcUrl, "aria2.remove", [gid], rpcToken).catch(() => {});
        return { success: false, gid, status: "removed", errorMessage: "任务已被取消。" };
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const status = (await rpcCall(rpcUrl, "aria2.tellStatus", [gid], rpcToken)) as Aria2StatusResult;

      if (status.status === "complete") {
        const filePaths = (status.files ?? []).map((f) => f.path);
        return { success: true, gid, status: "complete", files: filePaths };
      }

      if (status.status === "error") {
        return {
          success: false,
          gid,
          status: "error",
          errorMessage: status.errorMessage || `aria2 下载错误 (code: ${status.errorCode ?? "unknown"})`,
        };
      }

      if (status.status === "removed") {
        return { success: false, gid, status: "removed", errorMessage: "下载已被移除。" };
      }
    }

    return { success: false, gid, status: "active", errorMessage: "aria2 下载超时（超过 1 小时）。" };
  } catch (error) {
    return {
      success: false,
      gid: "",
      status: "error",
      errorMessage: error instanceof Error ? error.message : "aria2 RPC 调用失败。",
    };
  } finally {
    if (taskId) {
      aria2Gids.delete(taskId);
      aria2Canceled.delete(taskId);
    }
  }
}

export async function cancelAria2Download(taskId: string, rpcUrl?: string, rpcToken?: string): Promise<void> {
  const gid = aria2Gids.get(taskId);
  if (gid && rpcUrl) {
    aria2Gids.delete(taskId);
    try {
      await rpcCall(rpcUrl, "aria2.remove", [gid], rpcToken, AbortSignal.timeout(5000));
    } catch {
      /* ignore */
    }
    return;
  }

  aria2Canceled.add(taskId);
}

export async function cleanupAria2TempDir(tempDirectory: string): Promise<void> {
  await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
}

export async function checkAria2Connectivity(
  rpcUrl: string,
  rpcToken?: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const version = (await rpcCall(rpcUrl, "aria2.getVersion", [], rpcToken, AbortSignal.timeout(5000))) as {
      version: string;
      enabledFeatures: string[];
    };
    return {
      ok: true,
      message: `aria2 ${version.version} 已就绪（功能：${(version.enabledFeatures ?? []).join(", ") || "无"}）`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "无法连接到 aria2 RPC。" };
  }
}
