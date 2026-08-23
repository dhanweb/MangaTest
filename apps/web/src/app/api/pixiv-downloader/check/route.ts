import { checkPixivDownloaderConnection } from "@/modules/metadata-ingest/sources/pixiv-downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    dbPath?: unknown;
    downloadRoot?: unknown;
  } | null;

  const override =
    payload && typeof payload === "object"
      ? {
          dbPath: typeof payload.dbPath === "string" ? payload.dbPath : undefined,
          downloadRoot: typeof payload.downloadRoot === "string" ? payload.downloadRoot : undefined,
        }
      : undefined;

  try {
    return Response.json({ result: await checkPixivDownloaderConnection(override) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "连接测试失败。" }, { status: 400 });
  }
}
