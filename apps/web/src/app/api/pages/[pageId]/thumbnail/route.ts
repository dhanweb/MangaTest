import { getReaderThumbnail } from "@/modules/media-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const url = new URL(request.url);
  const thumbnail = await getReaderThumbnail({
    pageId,
    width: parseDimension(url.searchParams.get("w")),
    height: parseDimension(url.searchParams.get("h")),
  });

  if (!thumbnail) {
    return new Response("Page thumbnail not found.", { status: 404 });
  }

  return new Response(new Uint8Array(thumbnail.data), {
    headers: {
      "Cache-Control": "private, max-age=86400",
      "Content-Type": thumbnail.contentType,
      "X-MangaTest-Cache": thumbnail.cacheStatus,
    },
  });
}

function parseDimension(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
