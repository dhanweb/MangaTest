import { timingSafeEqual } from "node:crypto";

import { getRuntimeSettings } from "@/modules/core/settings";

export async function validateMetadataImportToken(providedToken: string | null | undefined) {
  const settings = await getRuntimeSettings();

  if (settings.metadataImportBypassToken) {
    return;
  }

  const configuredToken = settings.metadataImportToken.trim();

  if (!configuredToken) {
    throw new Error("Metadata 导入令牌未配置。");
  }

  if (!tokensMatch(configuredToken, providedToken?.trim() ?? "")) {
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
