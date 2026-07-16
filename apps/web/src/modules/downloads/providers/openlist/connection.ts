import { createHash } from "node:crypto";

import { getRuntimeSettings, saveRuntimeSettings, type RuntimeSettings } from "@/modules/core/settings";

import {
  extractOpenListErrorCode,
  isOpenListDuplicateOfflineError as isDuplicateByStructuredRules,
  OPENLIST_DUPLICATE_OFFLINE_CODE,
} from "../../openlist-duplicate-error";

export const OPENLIST_PASSWORD_HASH_SALT = "-https://github.com/alist-org/alist";

export type OpenListConnectionStatus = "disabled" | "missing_settings" | "reachable" | "unauthorized" | "unreachable" | "invalid_response";
export type OpenListLoginStatus = "missing_settings" | "success" | "unauthorized" | "unreachable" | "invalid_response";
export type OpenListResourceProbeStatus =
  | "disabled"
  | "missing_settings"
  | "missing_resource"
  | "file_ready"
  | "directory"
  | "file_without_raw_url"
  | "unauthorized"
  | "not_found"
  | "unreachable"
  | "invalid_response";
export type OpenListDirectoryListStatus =
  | "disabled"
  | "missing_settings"
  | "missing_resource"
  | "reachable"
  | "unauthorized"
  | "not_found"
  | "unreachable"
  | "invalid_response";

export interface OpenListConnectionCheckResult {
  ok: boolean;
  status: OpenListConnectionStatus;
  checkedAt: string;
  baseUrl: string | null;
  tokenConfigured: boolean;
  message: string;
  publicApi: OpenListEndpointCheck | null;
  accountApi: OpenListEndpointCheck | null;
}

export interface OpenListEndpointCheck {
  endpoint: string;
  ok: boolean;
  status: number | null;
  code: number | null;
  message: string | null;
}

interface OpenListConnectionCheckOptions {
  fetchImpl?: typeof fetch;
  settings?: RuntimeSettings;
}

export interface OpenListRemoteResource {
  name: string;
  sizeBytes: number | null;
  isDirectory: boolean;
  modifiedAt: string | null;
  provider: string | null;
  type: number | null;
  rawUrlAvailable: boolean;
}

export interface OpenListDirectorySnapshot {
  entries: OpenListRemoteResource[];
  total: number | null;
  page: number | null;
  perPage: number | null;
  hasMore: boolean | null;
  provider: string | null;
}

export interface OpenListResourceProbeResult {
  ok: boolean;
  status: OpenListResourceProbeStatus;
  checkedAt: string;
  baseUrl: string | null;
  path: string | null;
  tokenConfigured: boolean;
  message: string;
  resource: OpenListRemoteResource | null;
  fileApi: OpenListEndpointCheck | null;
}

export interface OpenListDownloadLinkResult extends OpenListResourceProbeResult {
  rawUrl: string | null;
  headers: Record<string, string>;
}

export interface OpenListDirectoryListResult {
  ok: boolean;
  status: OpenListDirectoryListStatus;
  checkedAt: string;
  baseUrl: string | null;
  path: string | null;
  tokenConfigured: boolean;
  message: string;
  directory: OpenListDirectorySnapshot | null;
  listApi: OpenListEndpointCheck | null;
}

interface OpenListResourceProbeOptions {
  fetchImpl?: typeof fetch;
  page?: number;
  settings?: RuntimeSettings;
  perPage?: number;
  /** Force OpenList/storage to refresh listing (hits upstream more). */
  refresh?: boolean;
  /** 内部重试标记，防止自动刷新 token 死循环。 */
  skipAuthRefresh?: boolean;
}

export interface OpenListAuthRefreshResult {
  ok: boolean;
  settings: RuntimeSettings;
  tokenRefreshed: boolean;
  message: string;
}

export interface OpenListLoginInput {
  baseUrl: string;
  enabled?: boolean;
  username: string;
  password: string;
  otpCode?: string | null;
}

export interface OpenListLoginResult {
  ok: boolean;
  status: OpenListLoginStatus;
  checkedAt: string;
  baseUrl: string | null;
  token: string | null;
  tokenConfigured: boolean;
  message: string;
  authApi: OpenListEndpointCheck | null;
}

interface OpenListLoginOptions {
  fetchImpl?: typeof fetch;
}

export async function checkOpenListConnection(options: OpenListConnectionCheckOptions = {}): Promise<OpenListConnectionCheckResult> {
  const settings = options.settings ?? (await getRuntimeSettings());
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(settings.openlistBaseUrl);
  const token = settings.openlistToken.trim();
  const tokenConfigured = token.length > 0;

  if (!baseUrl || !tokenConfigured) {
    return {
      ok: false,
      status: "missing_settings",
      checkedAt,
      baseUrl,
      tokenConfigured,
      message: "OpenList 连接校验需要服务地址和访问 token。",
      publicApi: null,
      accountApi: null,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const publicApi = await probeOpenListEndpoint(fetchImpl, buildOpenListUrl(baseUrl, "api/public/offline_download_tools"));

  if (!publicApi.ok && publicApi.status == null) {
    return {
      ok: false,
      status: "unreachable",
      checkedAt,
      baseUrl,
      tokenConfigured,
      message: publicApi.message ?? "无法连接 OpenList 服务。",
      publicApi,
      accountApi: null,
    };
  }

  const accountApi = await probeOpenListEndpoint(fetchImpl, buildOpenListUrl(baseUrl, "api/me"), {
    Authorization: token,
  });

  if (accountApi.status === 401 || accountApi.status === 403) {
    return {
      ok: false,
      status: "unauthorized",
      checkedAt,
      baseUrl,
      tokenConfigured,
      message: "OpenList token 未通过认证。",
      publicApi,
      accountApi,
    };
  }

  if (!accountApi.ok) {
    return {
      ok: false,
      status: accountApi.status == null ? "unreachable" : "invalid_response",
      checkedAt,
      baseUrl,
      tokenConfigured,
      message: accountApi.message ?? "OpenList 账号接口返回异常。",
      publicApi,
      accountApi,
    };
  }

  return {
    ok: true,
    status: "reachable",
    checkedAt,
    baseUrl,
    tokenConfigured,
    message: "OpenList 连接和 token 校验通过。",
    publicApi,
    accountApi,
  };
}

export async function loginOpenList(input: OpenListLoginInput, options: OpenListLoginOptions = {}): Promise<OpenListLoginResult> {
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const username = input.username.trim();
  const password = input.password;
  const otpCode = input.otpCode?.trim() || undefined;

  if (!baseUrl || !username || !password) {
    return {
      ok: false,
      status: "missing_settings",
      checkedAt,
      baseUrl,
      token: null,
      tokenConfigured: false,
      message: "OpenList 登录需要服务地址、用户名和密码。",
      authApi: null,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const authApi = await postOpenListAuth(fetchImpl, buildOpenListUrl(baseUrl, "api/auth/login/hash"), {
    otp_code: otpCode,
    password: hashOpenListPassword(password),
    username,
  });
  const publicAuthApi = toPublicEndpointCheck(authApi);

  if (authApi.status === 401 || authApi.status === 403) {
    return {
      ok: false,
      status: "unauthorized",
      checkedAt,
      baseUrl,
      token: null,
      tokenConfigured: false,
      message: "OpenList 用户名、密码或 OTP 未通过认证。",
      authApi: publicAuthApi,
    };
  }

  if (!authApi.ok) {
    return {
      ok: false,
      status: authApi.status == null ? "unreachable" : "invalid_response",
      checkedAt,
      baseUrl,
      token: null,
      tokenConfigured: false,
      message: authApi.message ?? "OpenList 登录接口返回异常。",
      authApi: publicAuthApi,
    };
  }

  const token = authApi.token;
  if (!token) {
    return {
      ok: false,
      status: "invalid_response",
      checkedAt,
      baseUrl,
      token: null,
      tokenConfigured: false,
      message: "OpenList 登录成功响应缺少 token。",
      authApi: publicAuthApi,
    };
  }

  return {
    ok: true,
    status: "success",
    checkedAt,
    baseUrl,
    token,
    tokenConfigured: true,
    message: "OpenList 登录成功，token 已获取。",
    authApi: publicAuthApi,
  };
}

/**
 * 使用已保存的账号密码重新登录 OpenList，并写回 openlistToken。
 * forceRefresh=false 且已有 token 时不请求登录。
 */
export async function ensureOpenListToken(
  settings: RuntimeSettings,
  options: { fetchImpl?: typeof fetch; forceRefresh?: boolean } = {},
): Promise<OpenListAuthRefreshResult> {
  if (!options.forceRefresh && settings.openlistToken.trim()) {
    return {
      ok: true,
      settings,
      tokenRefreshed: false,
      message: "OpenList token 仍可用。",
    };
  }

  const baseUrl = settings.openlistBaseUrl.trim();
  const username = settings.openlistUsername.trim();
  const password = settings.openlistPassword;

  if (!baseUrl || !username || !password) {
    return {
      ok: false,
      settings,
      tokenRefreshed: false,
      message: "OpenList token 已过期或缺失，且未保存账号密码，无法自动登录。请到设置页重新登录。",
    };
  }

  const login = await loginOpenList(
    {
      baseUrl,
      enabled: settings.openlistEnabled,
      username,
      password,
    },
    { fetchImpl: options.fetchImpl },
  );

  if (!login.ok || !login.token) {
    return {
      ok: false,
      settings,
      tokenRefreshed: false,
      message: login.message || "OpenList 自动登录失败。",
    };
  }

  const nextSettings = await saveRuntimeSettings({
    openlistBaseUrl: login.baseUrl ?? baseUrl,
    openlistToken: login.token,
  });

  return {
    ok: true,
    settings: nextSettings,
    tokenRefreshed: true,
    message: "OpenList token 已自动刷新。",
  };
}

type OpenListAuthRetryResult<T> =
  | { ok: true; value: T }
  | { ok: false; refreshMessage: string | null };

async function retryWithRefreshedOpenListToken<T>(
  settings: RuntimeSettings,
  options: { fetchImpl?: typeof fetch; skipAuthRefresh?: boolean },
  retry: (nextSettings: RuntimeSettings) => Promise<T>,
): Promise<OpenListAuthRetryResult<T>> {
  if (options.skipAuthRefresh) {
    return { ok: false, refreshMessage: null };
  }

  const refreshed = await ensureOpenListToken(settings, {
    fetchImpl: options.fetchImpl,
    forceRefresh: true,
  });

  if (!refreshed.ok) {
    return { ok: false, refreshMessage: refreshed.message };
  }

  return { ok: true, value: await retry(refreshed.settings) };
}

function unauthorizedOpenListMessage(refreshMessage: string | null | undefined, fallback = "OpenList token 未通过认证。") {
  if (refreshMessage?.trim()) {
    return refreshMessage.trim();
  }
  return fallback;
}

function isOpenListUnauthorized(check: { status: number | null; code: number | null; message?: string | null } | null | undefined) {
  if (!check) {
    return false;
  }

  if (check.status === 401 || check.status === 403) {
    return true;
  }

  if (check.code === 401 || check.code === 403) {
    return true;
  }

  const message = (check.message ?? "").toLowerCase();
  return /token.*(expired|invalid)|guest user is disabled|please login|unauthorized|未登录|token\s*失效|token\s*过期/.test(message);
}

export async function inspectOpenListResource(resourceUrl: string | null | undefined, options: OpenListResourceProbeOptions = {}): Promise<OpenListResourceProbeResult> {
  const settings = options.settings ?? (await getRuntimeSettings());
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(settings.openlistBaseUrl);
  let token = settings.openlistToken.trim();
  let tokenConfigured = token.length > 0;
  const resourcePath = normalizeOpenListResourcePath(resourceUrl);

  if (!settings.openlistEnabled) {
    return {
      ok: false,
      status: "disabled",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList provider 尚未启用。",
      resource: null,
      fileApi: null,
    };
  }

  if (!baseUrl) {
    return {
      ok: false,
      status: "missing_settings",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 资源预检需要服务地址和访问 token。",
      resource: null,
      fileApi: null,
    };
  }

  if (!tokenConfigured && !options.skipAuthRefresh) {
    const ensured = await ensureOpenListToken(settings, { fetchImpl: options.fetchImpl, forceRefresh: true });
    if (ensured.ok) {
      return inspectOpenListResource(resourceUrl, { ...options, settings: ensured.settings, skipAuthRefresh: true });
    }
  }

  token = settings.openlistToken.trim();
  tokenConfigured = token.length > 0;

  if (!tokenConfigured) {
    return {
      ok: false,
      status: "missing_settings",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 资源预检需要服务地址和访问 token。",
      resource: null,
      fileApi: null,
    };
  }

  if (!resourcePath) {
    return {
      ok: false,
      status: "missing_resource",
      checkedAt,
      baseUrl,
      path: null,
      tokenConfigured,
      message: "资源缺少 OpenList 路径。",
      resource: null,
      fileApi: null,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const fileApi = await postOpenListFileGet(fetchImpl, buildOpenListUrl(baseUrl, "api/fs/get"), token, resourcePath);
  const publicFileApi = toPublicEndpointCheck(fileApi);

  if (isOpenListUnauthorized(fileApi)) {
    const retried = await retryWithRefreshedOpenListToken(settings, options, (nextSettings) =>
      inspectOpenListResource(resourceUrl, { ...options, settings: nextSettings, skipAuthRefresh: true }),
    );
    if (retried.ok) {
      return retried.value;
    }

    return {
      ok: false,
      status: "unauthorized",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: unauthorizedOpenListMessage(retried.refreshMessage),
      resource: null,
      fileApi: publicFileApi,
    };
  }

  if (fileApi.status === 404 || fileApi.code === 404 || isOpenListNotFoundMessage(fileApi.message)) {
    return {
      ok: false,
      status: "not_found",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 路径不存在或当前账号不可见。",
      resource: null,
      fileApi: publicFileApi,
    };
  }

  if (!fileApi.ok || !fileApi.resource) {
    return {
      ok: false,
      status: fileApi.status == null ? "unreachable" : "invalid_response",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: fileApi.message ?? "OpenList 文件信息接口返回异常。",
      resource: null,
      fileApi: publicFileApi,
    };
  }

  if (fileApi.resource.isDirectory) {
    return {
      ok: true,
      status: "directory",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 路径是目录，后续需要进入云端目录扫描流程。",
      resource: fileApi.resource,
      fileApi: publicFileApi,
    };
  }

  if (!fileApi.resource.rawUrlAvailable) {
    return {
      ok: true,
      status: "file_without_raw_url",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 文件可访问，但响应中没有可用 raw_url。",
      resource: fileApi.resource,
      fileApi: publicFileApi,
    };
  }

  return {
    ok: true,
    status: "file_ready",
    checkedAt,
    baseUrl,
    path: resourcePath,
    tokenConfigured,
    message: "OpenList 文件路径可访问，并返回了可用 raw_url。",
    resource: fileApi.resource,
    fileApi: publicFileApi,
  };
}

export type OpenListOfflineDownloadStatus =
  | "disabled"
  | "missing_settings"
  | "submitted"
  | "duplicate_task"
  | "unauthorized"
  | "unreachable"
  | "invalid_response";

export interface OpenListOfflineDownloadResult {
  ok: boolean;
  status: OpenListOfflineDownloadStatus;
  checkedAt: string;
  baseUrl: string | null;
  tokenConfigured: boolean;
  message: string;
  taskId: string | null;
  apiCheck: OpenListEndpointCheck | null;
  openlistCode?: number | null;
}

/** Detect OpenList/115 "task already exists" (code 10008). Code-first; no Chinese-only match. */
export function isOpenListDuplicateOfflineError(code: number | null | undefined, message: string | null | undefined): boolean {
  return isDuplicateByStructuredRules({ code, message });
}

export { extractOpenListErrorCode, OPENLIST_DUPLICATE_OFFLINE_CODE };

export type OpenListOfflineTaskState = number; // 0=queued, 1=downloading, 2=done, 3=error

export interface OpenListOfflineTaskItem {
  id: string;
  name: string;
  state: OpenListOfflineTaskState;
  status: string;
  progress: number;
  error: string;
}

export async function submitOpenListOfflineDownload(
  url: string,
  savePath: string,
  tool = "115 Open",
  options: { fetchImpl?: typeof fetch; settings?: RuntimeSettings; skipAuthRefresh?: boolean } = {},
): Promise<OpenListOfflineDownloadResult> {
  const settings = options.settings ?? (await getRuntimeSettings());
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(settings.openlistBaseUrl);
  let token = settings.openlistToken.trim();
  let tokenConfigured = token.length > 0;

  if (!settings.openlistEnabled) {
    return { ok: false, status: "disabled", checkedAt, baseUrl, tokenConfigured, message: "OpenList provider 尚未启用。", taskId: null, apiCheck: null };
  }

  if (!baseUrl) {
    return { ok: false, status: "missing_settings", checkedAt, baseUrl, tokenConfigured, message: "OpenList needs base URL and token.", taskId: null, apiCheck: null };
  }

  if (!tokenConfigured && !options.skipAuthRefresh) {
    const ensured = await ensureOpenListToken(settings, { fetchImpl: options.fetchImpl, forceRefresh: true });
    if (ensured.ok) {
      return submitOpenListOfflineDownload(url, savePath, tool, { ...options, settings: ensured.settings, skipAuthRefresh: true });
    }
  }

  token = settings.openlistToken.trim();
  tokenConfigured = token.length > 0;

  if (!tokenConfigured) {
    return { ok: false, status: "missing_settings", checkedAt, baseUrl, tokenConfigured, message: "OpenList needs base URL and token.", taskId: null, apiCheck: null };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const apiEndpoint = buildOpenListUrl(baseUrl, "api/fs/add_offline_download");
  const endpoint = redactOpenListEndpoint(apiEndpoint);

  try {
    const response = await fetchImpl(apiEndpoint, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ path: savePath || "/", urls: [url], tool, delete_policy: "delete_on_upload_succeed" }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => null);
    const payloadCode = typeof payload?.code === "number" ? payload.code : null;
    const payloadMessage = typeof payload?.message === "string" ? payload.message : null;

    const apiCheck: OpenListEndpointCheck = { endpoint, ok: response.ok && (payloadCode == null || payloadCode === 200), status: response.status, code: payloadCode, message: payloadMessage };

    if (isOpenListUnauthorized({ status: response.status, code: payloadCode, message: payloadMessage })) {
      const retried = await retryWithRefreshedOpenListToken(settings, options, (nextSettings) =>
        submitOpenListOfflineDownload(url, savePath, tool, { ...options, settings: nextSettings, skipAuthRefresh: true }),
      );
      if (retried.ok) {
        return retried.value;
      }
      return {
        ok: false,
        status: "unauthorized",
        checkedAt,
        baseUrl,
        tokenConfigured,
        message: unauthorizedOpenListMessage(retried.refreshMessage, payloadMessage || "OpenList token 未通过认证。"),
        taskId: null,
        apiCheck,
      };
    }
    if (!response.ok || (payloadCode != null && payloadCode !== 200)) {
      const failMessage = payloadMessage || "离线下载提交失败。";
      const resolvedCode = extractOpenListErrorCode(payload, response.status) ?? payloadCode;
      if (isOpenListDuplicateOfflineError(resolvedCode, failMessage)) {
        return {
          ok: false,
          status: "duplicate_task",
          checkedAt,
          baseUrl,
          tokenConfigured,
          message: failMessage,
          taskId: null,
          apiCheck,
          openlistCode: OPENLIST_DUPLICATE_OFFLINE_CODE,
        };
      }
      return {
        ok: false,
        status: "invalid_response",
        checkedAt,
        baseUrl,
        tokenConfigured,
        message: failMessage,
        taskId: null,
        apiCheck,
        openlistCode: resolvedCode,
      };
    }

    const tasks: OpenListOfflineTaskItem[] = Array.isArray(payload?.data?.tasks) ? payload.data.tasks : [];
    const taskId = tasks[0]?.id ?? null;
    return { ok: true, status: "submitted", checkedAt, baseUrl, tokenConfigured, message: payloadMessage || "离线下载已提交到 OpenList。", taskId, apiCheck };
  } catch (error) {
    return { ok: false, status: "unreachable", checkedAt, baseUrl, tokenConfigured, message: error instanceof Error ? error.message : "OpenList 请求失败。", taskId: null, apiCheck: { endpoint, ok: false, status: null, code: null, message: null } };
  }
}

export async function listOpenListOfflineTasks(
  kind: "undone" | "done",
  options: { fetchImpl?: typeof fetch; settings?: RuntimeSettings; skipAuthRefresh?: boolean } = {},
): Promise<OpenListOfflineTaskItem[]> {
  const settings = options.settings ?? (await getRuntimeSettings());
  const baseUrl = normalizeBaseUrl(settings.openlistBaseUrl);
  let token = settings.openlistToken.trim();

  if (!baseUrl) {
    return [];
  }

  if (!token && !options.skipAuthRefresh) {
    const ensured = await ensureOpenListToken(settings, { fetchImpl: options.fetchImpl, forceRefresh: true });
    if (ensured.ok) {
      return listOpenListOfflineTasks(kind, { ...options, settings: ensured.settings, skipAuthRefresh: true });
    }
  }

  token = settings.openlistToken.trim();
  if (!token) {
    return [];
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const res = await fetchImpl(buildOpenListUrl(baseUrl, `api/task/offline_download/${kind}`), {
      method: "GET",
      headers: { Authorization: token },
      signal: AbortSignal.timeout(5000),
    });
    const payload = await res.json().catch(() => null);
    const payloadCode = typeof payload?.code === "number" ? payload.code : null;
    const payloadMessage = typeof payload?.message === "string" ? payload.message : null;

    if (isOpenListUnauthorized({ status: res.status, code: payloadCode, message: payloadMessage })) {
      const retried = await retryWithRefreshedOpenListToken(settings, options, (nextSettings) =>
        listOpenListOfflineTasks(kind, { ...options, settings: nextSettings, skipAuthRefresh: true }),
      );
      if (retried.ok) {
        return retried.value;
      }
      return [];
    }

    if (payload?.code === 200 && Array.isArray(payload?.data)) {
      return payload.data;
    }
    return [];
  } catch {
    return [];
  }
}

export async function resolveOpenListDownloadLink(resourceUrl: string | null | undefined, options: OpenListResourceProbeOptions = {}): Promise<OpenListDownloadLinkResult> {
  const settings = options.settings ?? (await getRuntimeSettings());
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(settings.openlistBaseUrl);
  let token = settings.openlistToken.trim();
  let tokenConfigured = token.length > 0;
  const resourcePath = normalizeOpenListResourcePath(resourceUrl);

  if (!settings.openlistEnabled) {
    return {
      ok: false,
      status: "disabled",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList provider 尚未启用。",
      resource: null,
      rawUrl: null,
      headers: {},
      fileApi: null,
    };
  }

  if (!baseUrl) {
    return {
      ok: false,
      status: "missing_settings",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 下载取链需要服务地址和访问 token。",
      resource: null,
      rawUrl: null,
      headers: {},
      fileApi: null,
    };
  }

  let missingTokenRefreshMessage: string | null = null;
  if (!tokenConfigured && !options.skipAuthRefresh) {
    const ensured = await ensureOpenListToken(settings, { fetchImpl: options.fetchImpl, forceRefresh: true });
    if (ensured.ok) {
      return resolveOpenListDownloadLink(resourceUrl, { ...options, settings: ensured.settings, skipAuthRefresh: true });
    }
    missingTokenRefreshMessage = ensured.message;
  }

  token = settings.openlistToken.trim();
  tokenConfigured = token.length > 0;

  if (!tokenConfigured) {
    return {
      ok: false,
      status: "missing_settings",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: unauthorizedOpenListMessage(missingTokenRefreshMessage, "OpenList 下载取链需要服务地址和访问 token。"),
      resource: null,
      rawUrl: null,
      headers: {},
      fileApi: null,
    };
  }

  if (!resourcePath) {
    return {
      ok: false,
      status: "missing_resource",
      checkedAt,
      baseUrl,
      path: null,
      tokenConfigured,
      message: "资源缺少 OpenList 路径。",
      resource: null,
      rawUrl: null,
      headers: {},
      fileApi: null,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const fileApi = await postOpenListFileGet(fetchImpl, buildOpenListUrl(baseUrl, "api/fs/get"), token, resourcePath);
  const publicFileApi = toPublicEndpointCheck(fileApi);

  if (isOpenListUnauthorized(fileApi)) {
    const retried = await retryWithRefreshedOpenListToken(settings, options, (nextSettings) =>
      resolveOpenListDownloadLink(resourceUrl, { ...options, settings: nextSettings, skipAuthRefresh: true }),
    );
    if (retried.ok) {
      return retried.value;
    }

    return {
      ok: false,
      status: "unauthorized",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: unauthorizedOpenListMessage(retried.refreshMessage),
      resource: null,
      rawUrl: null,
      headers: {},
      fileApi: publicFileApi,
    };
  }

  if (fileApi.status === 404 || fileApi.code === 404 || isOpenListNotFoundMessage(fileApi.message)) {
    return {
      ok: false,
      status: "not_found",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 路径不存在或当前账号不可见。",
      resource: null,
      rawUrl: null,
      headers: {},
      fileApi: publicFileApi,
    };
  }

  if (!fileApi.ok || !fileApi.resource) {
    return {
      ok: false,
      status: fileApi.status == null ? "unreachable" : "invalid_response",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: fileApi.message ?? "OpenList 文件信息接口返回异常。",
      resource: null,
      rawUrl: null,
      headers: {},
      fileApi: publicFileApi,
    };
  }

  if (fileApi.resource.isDirectory) {
    return {
      ok: true,
      status: "directory",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 路径是目录，不能直接下载为临时文件。",
      resource: fileApi.resource,
      rawUrl: null,
      headers: {},
      fileApi: publicFileApi,
    };
  }

  // 优先通过 /api/fs/link 获取下载链接（含请求头，如 User-Agent、Referer），
  // 这些请求头对某些存储（如 115）是必需的，aria2 裸 URL 请求会返回 403。
  // 参考 OpenList download-first-from-dir.js：link 返回 header/headers，URL 可能是相对路径。
  const linkApi = await postOpenListFileLink(
    fetchImpl,
    buildOpenListUrl(baseUrl, "api/fs/link"),
    token,
    resourcePath,
  );

  if (isOpenListUnauthorized(linkApi)) {
    const retried = await retryWithRefreshedOpenListToken(settings, options, (nextSettings) =>
      resolveOpenListDownloadLink(resourceUrl, { ...options, settings: nextSettings, skipAuthRefresh: true }),
    );
    if (retried.ok) {
      return retried.value;
    }
  }

  if (linkApi.ok && linkApi.linkUrl) {
    const absoluteLinkUrl = joinOpenListDownloadUrl(baseUrl, linkApi.linkUrl) ?? linkApi.linkUrl;
    return {
      ok: true,
      status: "file_ready",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 文件下载链接已获取（含请求头）。",
      resource: fileApi.resource,
      rawUrl: absoluteLinkUrl,
      headers: linkApi.headers,
      fileApi: publicFileApi,
    };
  }

  if (fileApi.rawUrl) {
    const absoluteRawUrl = joinOpenListDownloadUrl(baseUrl, fileApi.rawUrl) ?? fileApi.rawUrl;
    return {
      ok: true,
      status: "file_ready",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 文件下载链接已获取（raw_url）。",
      resource: fileApi.resource,
      rawUrl: absoluteRawUrl,
      headers: {},
      fileApi: publicFileApi,
    };
  }

  return {
    ok: true,
    status: "file_without_raw_url",
    checkedAt,
    baseUrl,
    path: resourcePath,
    tokenConfigured,
    message: "OpenList 文件可访问，但 /api/fs/link 和 raw_url 均无可用链接。",
    resource: fileApi.resource,
    rawUrl: null,
    headers: {},
    fileApi: publicFileApi,
  };
}

export async function listOpenListDirectory(resourceUrl: string | null | undefined, options: OpenListResourceProbeOptions = {}): Promise<OpenListDirectoryListResult> {
  const settings = options.settings ?? (await getRuntimeSettings());
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(settings.openlistBaseUrl);
  let token = settings.openlistToken.trim();
  let tokenConfigured = token.length > 0;
  const resourcePath = normalizeOpenListResourcePath(resourceUrl);

  if (!settings.openlistEnabled) {
    return {
      ok: false,
      status: "disabled",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList provider 尚未启用。",
      directory: null,
      listApi: null,
    };
  }

  if (!baseUrl) {
    return {
      ok: false,
      status: "missing_settings",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 目录列举需要服务地址和访问 token。",
      directory: null,
      listApi: null,
    };
  }

  if (!tokenConfigured && !options.skipAuthRefresh) {
    const ensured = await ensureOpenListToken(settings, { fetchImpl: options.fetchImpl, forceRefresh: true });
    if (ensured.ok) {
      return listOpenListDirectory(resourceUrl, { ...options, settings: ensured.settings, skipAuthRefresh: true });
    }
  }

  token = settings.openlistToken.trim();
  tokenConfigured = token.length > 0;

  if (!tokenConfigured) {
    return {
      ok: false,
      status: "missing_settings",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 目录列举需要服务地址和访问 token。",
      directory: null,
      listApi: null,
    };
  }

  if (!resourcePath) {
    return {
      ok: false,
      status: "missing_resource",
      checkedAt,
      baseUrl,
      path: null,
      tokenConfigured,
      message: "目录列举缺少 OpenList 路径。",
      directory: null,
      listApi: null,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const listApi = await postOpenListDirectoryList(
    fetchImpl,
    buildOpenListUrl(baseUrl, "api/fs/list"),
    token,
    resourcePath,
    normalizePage(options.page),
    normalizePerPage(options.perPage),
    Boolean(options.refresh),
  );
  const publicListApi = toPublicEndpointCheck(listApi);

  if (isOpenListUnauthorized(listApi)) {
    const retried = await retryWithRefreshedOpenListToken(settings, options, (nextSettings) =>
      listOpenListDirectory(resourceUrl, { ...options, settings: nextSettings, skipAuthRefresh: true }),
    );
    if (retried.ok) {
      return retried.value;
    }

    return {
      ok: false,
      status: "unauthorized",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: unauthorizedOpenListMessage(retried.refreshMessage),
      directory: null,
      listApi: publicListApi,
    };
  }

  if (listApi.status === 404 || listApi.code === 404 || isOpenListNotFoundMessage(listApi.message)) {
    return {
      ok: false,
      status: "not_found",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList 目录不存在或当前账号不可见。",
      directory: null,
      listApi: publicListApi,
    };
  }

  if (!listApi.ok || !listApi.directory) {
    return {
      ok: false,
      status: listApi.status == null ? "unreachable" : "invalid_response",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: listApi.message ?? "OpenList 目录列表接口返回异常。",
      directory: null,
      listApi: publicListApi,
    };
  }

  return {
    ok: true,
    status: "reachable",
    checkedAt,
    baseUrl,
    path: resourcePath,
    tokenConfigured,
    message: "OpenList 目录列表可读取。",
    directory: listApi.directory,
    listApi: publicListApi,
  };
}

async function probeOpenListEndpoint(fetchImpl: typeof fetch, url: string, headers?: HeadersInit): Promise<OpenListEndpointCheck> {
  const endpoint = redactOpenListEndpoint(url);

  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers,
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => null);
    const payloadCode = typeof payload?.code === "number" ? payload.code : null;
    const payloadMessage = typeof payload?.message === "string" ? payload.message : null;

    return {
      endpoint,
      ok: response.ok && (payloadCode == null || payloadCode === 200),
      status: response.status,
      code: payloadCode,
      message: payloadMessage,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: null,
      code: null,
      message: error instanceof Error ? error.message : "OpenList 请求失败。",
    };
  }
}

async function postOpenListDirectoryList(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  resourcePath: string,
  page: number,
  perPage: number,
  refresh = false,
): Promise<OpenListEndpointCheck & { directory: OpenListDirectorySnapshot | null }> {
  const endpoint = redactOpenListEndpoint(url);

  try {
    const response = await fetchImpl(url, {
      body: JSON.stringify({
        page,
        password: "",
        path: resourcePath,
        per_page: perPage,
        refresh,
      }),
      cache: "no-store",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => null);
    const payloadCode = typeof payload?.code === "number" ? payload.code : null;
    const payloadMessage = typeof payload?.message === "string" ? payload.message : null;
    const directory = normalizeOpenListDirectorySnapshot(payload?.data);

    return {
      endpoint,
      ok: response.ok && (payloadCode == null || payloadCode === 200) && Boolean(directory),
      status: response.status,
      code: payloadCode,
      message: payloadMessage,
      directory,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: null,
      code: null,
      message: error instanceof Error ? error.message : "OpenList 目录列表请求失败。",
      directory: null,
    };
  }
}

async function postOpenListFileGet(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  resourcePath: string,
): Promise<OpenListEndpointCheck & { resource: OpenListRemoteResource | null; rawUrl: string | null }> {
  const endpoint = redactOpenListEndpoint(url);

  try {
    const response = await fetchImpl(url, {
      body: JSON.stringify({
        page: 1,
        password: "",
        path: resourcePath,
        per_page: 0,
        refresh: false,
      }),
      cache: "no-store",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => null);
    const payloadCode = typeof payload?.code === "number" ? payload.code : null;
    const payloadMessage = typeof payload?.message === "string" ? payload.message : null;
    const resource = normalizeOpenListRemoteResource(payload?.data);
    const rawUrl = extractOpenListRawUrl(payload?.data);

    return {
      endpoint,
      ok: response.ok && (payloadCode == null || payloadCode === 200) && Boolean(resource),
      status: response.status,
      code: payloadCode,
      message: payloadMessage,
      resource,
      rawUrl,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: null,
      code: null,
      message: error instanceof Error ? error.message : "OpenList 文件信息请求失败。",
      resource: null,
      rawUrl: null,
    };
  }
}

async function postOpenListFileLink(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  resourcePath: string,
): Promise<OpenListEndpointCheck & { linkUrl: string | null; headers: Record<string, string> }> {
  const endpoint = redactOpenListEndpoint(url);

  try {
    const response = await fetchImpl(url, {
      body: JSON.stringify({
        path: resourcePath,
        password: "",
      }),
      cache: "no-store",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(10000),
    });
    const payload = await response.json().catch(() => null);
    const payloadCode = typeof payload?.code === "number" ? payload.code : null;
    const payloadMessage = typeof payload?.message === "string" ? payload.message : null;
    const data = payload?.data as Record<string, unknown> | undefined;
    // OpenList/Alist 与 download-first-from-dir.js：url | raw_url | download_url
    const linkUrl = extractOpenListLinkUrl(data);
    // http.Header 序列化为 map[string][]string，值常为数组；只取 string 会丢掉全部请求头导致 CDN 403。
    const headers = normalizeOpenListRequestHeaders(data?.header ?? data?.headers);

    return {
      endpoint,
      ok: response.ok && (payloadCode == null || payloadCode === 200) && Boolean(linkUrl),
      status: response.status,
      code: payloadCode,
      message: payloadMessage,
      linkUrl,
      headers,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: null,
      code: null,
      message: error instanceof Error ? error.message : "OpenList 下载链请求失败。",
      linkUrl: null,
      headers: {},
    };
  }
}

async function postOpenListAuth(
  fetchImpl: typeof fetch,
  url: string,
  body: { otp_code?: string; password: string; username: string },
): Promise<OpenListEndpointCheck & { token: string | null }> {
  const endpoint = redactOpenListEndpoint(url);

  try {
    const response = await fetchImpl(url, {
      body: JSON.stringify(body),
      cache: "no-store",
      headers: {
        "Client-Id": "mangatest-local",
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => null);
    const payloadCode = typeof payload?.code === "number" ? payload.code : null;
    const payloadMessage = typeof payload?.message === "string" ? payload.message : null;
    const token = typeof payload?.data?.token === "string" ? payload.data.token : null;

    return {
      endpoint,
      ok: response.ok && (payloadCode == null || payloadCode === 200),
      status: response.status,
      code: payloadCode,
      message: payloadMessage,
      token,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: null,
      code: null,
      message: error instanceof Error ? error.message : "OpenList 登录请求失败。",
      token: null,
    };
  }
}

export function hashOpenListPassword(password: string) {
  return createHash("sha256").update(`${password}${OPENLIST_PASSWORD_HASH_SALT}`).digest("hex");
}

export function normalizeOpenListResourcePath(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  let text = value.trim();
  if (!text) {
    return null;
  }

  if (/^openlist:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      text = `${url.hostname ? `/${url.hostname}` : ""}${url.pathname}`;
    } catch {
      return null;
    }
  } else if (/^openlist:/i.test(text)) {
    text = text.slice(text.indexOf(":") + 1);
  } else if (/^https?:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname;
    } catch {
      return null;
    }
  }

  text = text.replace(/\\/g, "/").trim();

  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep the original path if it contains a literal percent sequence.
  }

  if (!text || text === "/") {
    return null;
  }

  return `/${text.replace(/^\/+/, "").replace(/\/{2,}/g, "/")}`;
}

function toPublicEndpointCheck(value: OpenListEndpointCheck): OpenListEndpointCheck {
  return {
    code: value.code,
    endpoint: value.endpoint,
    message: value.message,
    ok: value.ok,
    status: value.status,
  };
}

function normalizeOpenListRemoteResource(value: unknown): OpenListRemoteResource | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : null;
  const isDirectory = typeof record.is_dir === "boolean" ? record.is_dir : null;

  if (!name || isDirectory === null) {
    return null;
  }

  return {
    name,
    sizeBytes: typeof record.size === "number" && Number.isFinite(record.size) ? Math.max(0, Math.trunc(record.size)) : null,
    isDirectory,
    modifiedAt: typeof record.modified === "string" && record.modified.trim() ? record.modified : null,
    provider: typeof record.provider === "string" && record.provider.trim() ? record.provider : null,
    type: typeof record.type === "number" && Number.isFinite(record.type) ? Math.trunc(record.type) : null,
    rawUrlAvailable: typeof record.raw_url === "string" && record.raw_url.trim().length > 0,
  };
}

function extractOpenListRawUrl(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  // 与 download-first-from-dir.js 一致：raw_url || url || download_url || sign_url
  for (const key of ["raw_url", "url", "download_url", "sign_url"] as const) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function extractOpenListLinkUrl(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["url", "raw_url", "download_url", "sign_url"] as const) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

/**
 * OpenList/Alist `/api/fs/link` 的 header 字段类型为 http.Header（map[string][]string），
 * JSON 里值多为 string[]；也兼容 string 与 headers 字段名。
 */
export function normalizeOpenListRequestHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) {
      continue;
    }

    if (typeof raw === "string" && raw.trim()) {
      result[key] = raw;
      continue;
    }

    if (Array.isArray(raw)) {
      const first = raw.find((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (first) {
        result[key] = first;
      }
    }
  }

  return result;
}

/** 将 OpenList 返回的相对下载路径拼成绝对 URL（参考 download-first-from-dir.js joinUrl）。 */
export function joinOpenListDownloadUrl(baseUrl: string, value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  if (!text) {
    return null;
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  const base = baseUrl.replace(/\/+$/, "");
  if (text.startsWith("/")) {
    return `${base}${text}`;
  }

  return `${base}/${text}`;
}

function normalizeOpenListDirectorySnapshot(value: unknown): OpenListDirectorySnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.content)) {
    return null;
  }

  return {
    entries: record.content.flatMap((entry) => {
      const resource = normalizeOpenListRemoteResource(entry);
      return resource ? [resource] : [];
    }),
    total: typeof record.total === "number" && Number.isFinite(record.total) ? Math.max(0, Math.trunc(record.total)) : null,
    page: typeof record.page === "number" && Number.isFinite(record.page) ? Math.max(1, Math.trunc(record.page)) : null,
    perPage: typeof record.per_page === "number" && Number.isFinite(record.per_page) ? Math.max(0, Math.trunc(record.per_page)) : null,
    hasMore: typeof record.has_more === "boolean" ? record.has_more : null,
    provider: typeof record.provider === "string" && record.provider.trim() ? record.provider : null,
  };
}

function normalizePage(value: number | undefined) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 1;
  return Math.max(1, parsed);
}

function normalizePerPage(value: number | undefined) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 20;
  return Math.max(1, Math.min(50, parsed));
}

function isOpenListNotFoundMessage(value: string | null) {
  if (!value) {
    return false;
  }

  const text = value.toLowerCase();
  return text.includes("not found") || text.includes("no such") || text.includes("不存在");
}

function normalizeBaseUrl(value: string) {
  const text = value.trim();

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function buildOpenListUrl(baseUrl: string, endpoint: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(endpoint, normalizedBase).toString();
}

function redactOpenListEndpoint(value: string) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}
