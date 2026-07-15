import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { importMetadataPayload, validateMetadataImportToken } from "@/modules/metadata-ingest";
import { comicResources, getDb } from "@/modules/core/db";
import { createDownloadTask } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await validateMetadataImportToken(getImportToken(request));
    const payload = await request.json().catch(() => null);
    const result = await importMetadataPayload(payload);

    // Magnet resources: create offline tasks once. createDownloadTask dispatches to OpenList immediately;
    // the offline worker only polls submitted tasks and must not submit again.
    if (result.resourceCount > 0 && payload?.resources?.length > 0) {
      const db = getDb();
      for (const resource of payload.resources) {
        if (resource?.type !== "magnet") continue;

        const cr = db
          .select({ id: comicResources.id })
          .from(comicResources)
          .where(
            and(
              eq(comicResources.comicId, result.comicId),
              eq(comicResources.resourceType, "magnet"),
              eq(comicResources.resourceUrl, resource.url),
            ),
          )
          .get();
        if (!cr) continue;

        await createDownloadTask({ comicResourceId: cr.id, provider: "openlist" });
      }
    }

    revalidatePath("/admin");
    revalidatePath("/admin/comics");
    revalidatePath("/admin/downloads");

    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败。";
    const status = message.includes("令牌") ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}

function getImportToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice("bearer ".length);
  return request.headers.get("x-mangatest-import-token");
}
