import { eq, sql } from "drizzle-orm";
import { bootstrapDatabase, comicResources, comicSources, downloadTasks, getDb } from "@/modules/core/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    bootstrapDatabase();
    const db = getDb();
    const rows = db
      .select({
        id: comicResources.id,
        comicSourceId: comicResources.comicSourceId,
        resourceType: comicResources.resourceType,
        displayLabel: comicResources.displayLabel,
        redactedResource: comicResources.redactedResource,
        createdAt: comicResources.createdAt,
        sourceSite: comicSources.site,
        taskId: downloadTasks.id,
        taskStatus: downloadTasks.status,
        taskErrorMessage: downloadTasks.errorMessage,
        taskCreatedAt: downloadTasks.createdAt,
      })
      .from(comicResources)
      .leftJoin(comicSources, eq(comicResources.comicSourceId, comicSources.id))
      .leftJoin(downloadTasks, eq(downloadTasks.comicResourceId, comicResources.id))
      .where(eq(comicResources.comicId, id))
      .orderBy(sql`${comicResources.createdAt} desc`)
      .all();
    return Response.json({ resources: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取资源失败" }, { status: 500 });
  }
}
