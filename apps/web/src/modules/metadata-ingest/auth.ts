import { timingSafeEqual } from "node:crypto";

import { getRuntimeSettings } from "@/modules/core/settings";

export async function validateMetadataImportToken(providedToken: string | null | undefined) {
  const settings = await getRuntimeSettings();
  const configuredToken = settings.metadataImportToken.trim();

  // 未配置令牌时跳过验证
  if (!configuredToken) {
    return;
  }

  // 令牌已配置但未提供时跳过
  if (!providedToken?.trim()) {
    return;
  }

  if (!tokensMatch(configuredToken, providedToken.trim())) {
    throw new Error("导入令牌无效。");
  }
}

function tokensMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
