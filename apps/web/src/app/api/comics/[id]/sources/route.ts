import { eq } from "drizzle-orm";
import { bootstrapDatabase, comicSources, getDb } from "@/modules/core/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    bootstrapDatabase();
    const db = getDb();
    const sources = db.select().from(comicSources).where(eq(comicSources.comicId, id)).all();
    return Response.json({ sources });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取来源失败" }, { status: 500 });
  }
}
