import { listPixivSyncSessions } from "@/modules/metadata-ingest/sources/pixiv-downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");

  try {
    return Response.json({ sessions: await listPixivSyncSessions(Number.isFinite(limit) ? limit : 20) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取同步批次失败。" }, { status: 400 });
  }
}
