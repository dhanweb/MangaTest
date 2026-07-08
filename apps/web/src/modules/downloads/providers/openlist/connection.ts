import { createHash } from "node:crypto";

import { getRuntimeSettings, type RuntimeSettings } from "@/modules/core/settings";

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
}

export interface OpenListLoginInput {
  baseUrl: string;
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

  if (!settings.openlistEnabled) {
    return {
      ok: false,
      status: "disabled",
      checkedAt,
      baseUrl,
      tokenConfigured,
      message: "OpenList provider 尚未启用。",
      publicApi: null,
      accountApi: null,
    };
  }

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

export async function inspectOpenListResource(resourceUrl: string | null | undefined, options: OpenListResourceProbeOptions = {}): Promise<OpenListResourceProbeResult> {
  const settings = options.settings ?? (await getRuntimeSettings());
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(settings.openlistBaseUrl);
  const token = settings.openlistToken.trim();
  const tokenConfigured = token.length > 0;
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

  if (!baseUrl || !tokenConfigured) {
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

  if (fileApi.status === 401 || fileApi.status === 403) {
    return {
      ok: false,
      status: "unauthorized",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList token 未通过认证。",
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

export async function listOpenListDirectory(resourceUrl: string | null | undefined, options: OpenListResourceProbeOptions = {}): Promise<OpenListDirectoryListResult> {
  const settings = options.settings ?? (await getRuntimeSettings());
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(settings.openlistBaseUrl);
  const token = settings.openlistToken.trim();
  const tokenConfigured = token.length > 0;
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

  if (!baseUrl || !tokenConfigured) {
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
  );
  const publicListApi = toPublicEndpointCheck(listApi);

  if (listApi.status === 401 || listApi.status === 403) {
    return {
      ok: false,
      status: "unauthorized",
      checkedAt,
      baseUrl,
      path: resourcePath,
      tokenConfigured,
      message: "OpenList token 未通过认证。",
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
): Promise<OpenListEndpointCheck & { directory: OpenListDirectorySnapshot | null }> {
  const endpoint = redactOpenListEndpoint(url);

  try {
    const response = await fetchImpl(url, {
      body: JSON.stringify({
        page,
        password: "",
        path: resourcePath,
        per_page: perPage,
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
): Promise<OpenListEndpointCheck & { resource: OpenListRemoteResource | null }> {
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

    return {
      endpoint,
      ok: response.ok && (payloadCode == null || payloadCode === 200) && Boolean(resource),
      status: response.status,
      code: payloadCode,
      message: payloadMessage,
      resource,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: null,
      code: null,
      message: error instanceof Error ? error.message : "OpenList 文件信息请求失败。",
      resource: null,
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
