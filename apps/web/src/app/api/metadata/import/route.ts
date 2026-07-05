import { revalidatePath } from "next/cache";

import { importMetadataPayload, validateMetadataImportToken } from "@/modules/metadata-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await validateMetadataImportToken(getImportToken(request));

    const payload = await request.json().catch(() => null);
    const result = await importMetadataPayload(payload);

    revalidatePath("/admin");
    revalidatePath("/admin/comics");

    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Metadata 导入失败。";
    const status = message.includes("令牌") ? 401 : 400;

    return Response.json({ error: message }, { status });
  }
}

function getImportToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length);
  }

  return request.headers.get("x-mangatest-import-token");
}
