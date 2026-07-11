import { and, desc, eq, or, sql } from "drizzle-orm";
import { bootstrapDatabase, getDb, operationLogs } from "@/modules/core/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    bootstrapDatabase();
    const db = getDb();
    const logs = db
      .select({
        id: operationLogs.id,
        operation: operationLogs.operation,
        targetType: operationLogs.targetType,
        targetId: operationLogs.targetId,
        summary: operationLogs.summary,
        createdAt: operationLogs.createdAt,
      })
      .from(operationLogs)
      .where(and(eq(operationLogs.targetType, "comic"), or(eq(operationLogs.targetId, id), sql`${operationLogs.summary} LIKE ${`%${id}%`}`)))
      .orderBy(desc(operationLogs.createdAt))
      .limit(20)
      .all();
    return Response.json({ logs });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取日志失败" }, { status: 500 });
  }
}
