import { revalidatePath } from "next/cache";

import { createOpenListCloudDirectoryScan, listOpenListCloudScans } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cloudScans = await listOpenListCloudScans();
  return Response.json({ cloudScans });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = parseCreateOpenListCloudScanPayload(payload);

  if (!parsed.input) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await createOpenListCloudDirectoryScan(parsed.input);
    const cloudScans = await listOpenListCloudScans();

    revalidatePath("/admin/downloads");

    return Response.json({ ...result, cloudScans });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "创建 OpenList 云端扫描失败。" }, { status: 400 });
  }
}

function parseCreateOpenListCloudScanPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { input: null, error: "comicResourceId is required." };
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.comicResourceId !== "string" || !record.comicResourceId.trim()) {
    return { input: null, error: "comicResourceId is required." };
  }

  return {
    input: {
      comicResourceId: record.comicResourceId,
    },
    error: null,
  };
}
