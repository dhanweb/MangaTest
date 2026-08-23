import { previewPixivDownloaderSync } from "@/modules/metadata-ingest/sources/pixiv-downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return Response.json({ result: await previewPixivDownloaderSync() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "同步预览失败。" }, { status: 400 });
  }
}
