import { eq } from "drizzle-orm";
import { bootstrapDatabase, getDb, localFiles } from "@/modules/core/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    bootstrapDatabase();
    const db = getDb();
    const files = db
      .select({
        id: localFiles.id,
        kind: localFiles.kind,
        absolutePath: localFiles.absolutePath,
        relativePath: localFiles.relativePath,
        sizeBytes: localFiles.sizeBytes,
        mtimeMs: localFiles.mtimeMs,
        contentHash: localFiles.contentHash,
        isPrimary: localFiles.isPrimary,
        isMissing: localFiles.isMissing,
        isIgnored: localFiles.isIgnored,
        createdAt: localFiles.createdAt,
        updatedAt: localFiles.updatedAt,
      })
      .from(localFiles)
      .where(eq(localFiles.comicId, id))
      .all();
    return Response.json({ files });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取文件失败" }, { status: 500 });
  }
}
