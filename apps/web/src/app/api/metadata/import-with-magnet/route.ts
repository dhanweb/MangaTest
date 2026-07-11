import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { importMetadataPayload, validateMetadataImportToken } from "@/modules/metadata-ingest";
import { comicResources, downloadTasks, getDb } from "@/modules/core/db";
import { submitOpenListOfflineDownload } from "@/modules/downloads/providers/openlist/connection";
import { createDownloadTask } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await validateMetadataImportToken(getImportToken(request));
    const payload = await request.json().catch(() => null);
    const result = await importMetadataPayload(payload);

    // For each magnet resource submitted, directly submit to OpenList
    if (result.resourceCount > 0 && payload?.resources?.length > 0) {
      const db = getDb();
      for (const resource of payload.resources) {
        if (resource?.type !== "magnet") continue;

        const cr = db.select({ id: comicResources.id }).from(comicResources)
          .where(and(eq(comicResources.comicId, result.comicId), eq(comicResources.resourceType, "magnet"), eq(comicResources.resourceUrl, resource.url)))
          .get();
        if (!cr) continue;

        const task = await createDownloadTask({ comicResourceId: cr.id, provider: "openlist" });
        if (task?.task?.id) {
          const savePath = "/115Open/Temp";
          const olResult = await submitOpenListOfflineDownload(resource.url, savePath, "115 Open");
          const now = new Date().toISOString();
          if (olResult.ok) {
            db.update(downloadTasks).set({ status: "running", errorMessage: JSON.stringify({ olTaskId: olResult.taskId, olPath: savePath }), updatedAt: now }).where(eq(downloadTasks.id, task.task.id)).run();
          } else {
            db.update(downloadTasks).set({ status: "failed", errorMessage: olResult.message, updatedAt: now }).where(eq(downloadTasks.id, task.task.id)).run();
          }
        }
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
