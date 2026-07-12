import { checkOpenListConnection } from "@/modules/downloads/providers/openlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  let settingsOverride: Parameters<typeof checkOpenListConnection>[0] | undefined;

  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    if (typeof body.baseUrl === "string" || typeof body.token === "string") {
      const { getRuntimeSettings } = await import("@/modules/core/settings");
      const dbSettings = await getRuntimeSettings();
      settingsOverride = {
        settings: {
          ...dbSettings,
          openlistEnabled: typeof body.enabled === "boolean" ? body.enabled : dbSettings.openlistEnabled,
          openlistBaseUrl: typeof body.baseUrl === "string" ? body.baseUrl : dbSettings.openlistBaseUrl,
          openlistToken: typeof body.token === "string" ? body.token : dbSettings.openlistToken,
        },
      };
    }
  }

  return Response.json({ result: await checkOpenListConnection(settingsOverride) });
}
