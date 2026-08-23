import { getPixivSyncSessionDetail } from "@/modules/metadata-ingest/sources/pixiv-downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getPixivSyncSessionDetail(id);

    if (!detail) {
      return Response.json({ error: "同步批次不存在。" }, { status: 404 });
    }

    return Response.json(detail);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取同步批次失败。" }, { status: 400 });
  }
}
