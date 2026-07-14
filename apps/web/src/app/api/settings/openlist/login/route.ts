import { getRuntimeSettings } from "@/modules/core/settings";
import { loginOpenList, type OpenListLoginInput, type OpenListLoginResult } from "@/modules/downloads/providers/openlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicOpenListLoginResult = Omit<OpenListLoginResult, "token">;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const input = parseOpenListLoginPayload(payload);

  if (!input) {
    return Response.json({ error: "OpenList 登录需要服务地址、用户名和密码。" }, { status: 400 });
  }

  const result = await loginOpenList(input);
  const publicResult = toPublicLoginResult(result);

  if (!result.ok || !result.token || !result.baseUrl) {
    return Response.json({ result: publicResult }, { status: 400 });
  }

  // Return a candidate settings object for the caller to validate first.
  // Do not persist a token until the subsequent connection check succeeds.
  const currentSettings = await getRuntimeSettings();
  const settings = {
    ...currentSettings,
    openlistBaseUrl: result.baseUrl,
    openlistEnabled: input.enabled ?? currentSettings.openlistEnabled,
    openlistToken: result.token,
  };

  return Response.json({
    result: publicResult,
    settings,
  });
}

function parseOpenListLoginPayload(payload: unknown): OpenListLoginInput | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.baseUrl !== "string" || typeof record.username !== "string" || typeof record.password !== "string") {
    return null;
  }

  return {
    baseUrl: record.baseUrl,
    enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
    username: record.username,
    password: record.password,
    otpCode: typeof record.otpCode === "string" ? record.otpCode : null,
  };
}

function toPublicLoginResult(result: OpenListLoginResult): PublicOpenListLoginResult {
  return {
    authApi: result.authApi,
    baseUrl: result.baseUrl,
    checkedAt: result.checkedAt,
    message: result.message,
    ok: result.ok,
    status: result.status,
    tokenConfigured: result.tokenConfigured,
  };
}
