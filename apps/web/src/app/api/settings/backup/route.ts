import { createSqliteBackupDownload } from "@/modules/core/db/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const backup = await createSqliteBackupDownload();

    return new Response(new Uint8Array(backup.data), {
      headers: {
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
        "Content-Length": String(backup.sizeBytes),
        "Content-Type": "application/vnd.sqlite3",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SQLite 备份导出失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
