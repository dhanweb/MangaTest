import { getComicCover, regenerateComicCover } from "@/modules/media-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const cover = await getComicCover({
    comicId: id,
    height: parseDimension(url.searchParams.get("h")),
    use: parseCoverUse(url.searchParams.get("use")),
    width: parseDimension(url.searchParams.get("w")),
  });

  if (!cover) {
    return new Response("Comic cover not found.", { status: 404 });
  }

  return new Response(new Uint8Array(cover.data), {
    headers: {
      "Cache-Control": "private, max-age=86400",
      "Content-Type": cover.contentType,
      "X-MangaTest-Cache": cover.cacheStatus,
    },
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await regenerateComicCover({ comicId: id });

    if (result.generatedCount === 0) {
      return Response.json({ error: "没有可用于生成封面的本地页面。", result }, { status: 404 });
    }

    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "重新生成封面失败。" }, { status: 400 });
  }
}

function parseCoverUse(value: string | null) {
  return value === "cover" || value === "list_thumbnail" ? value : undefined;
}

function parseDimension(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
