import { createHash } from "node:crypto";

import { getRuntimeSettings, type RuntimeSettings } from "@/modules/core/settings";

export const OPENLIST_PASSWORD_HASH_SALT = "-https://github.com/alist-org/alist";

export type OpenListConnectionStatus = "disabled" | "missing_settings" | "reachable" | "unauthorized" | "unreachable" | "invalid_response";
export type OpenListLoginStatus = "missing_settings" | "success" | "unauthorized" | "unreachable" | "invalid_response";

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

function toPublicEndpointCheck(value: OpenListEndpointCheck): OpenListEndpointCheck {
  return {
    code: value.code,
    endpoint: value.endpoint,
    message: value.message,
    ok: value.ok,
    status: value.status,
  };
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
