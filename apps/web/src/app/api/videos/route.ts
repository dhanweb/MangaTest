import { createVideoRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await createVideoRepository().searchReadableCards({
    query: url.searchParams.get("q") ?? undefined,
    tags: url.searchParams.getAll("tag"),
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 48),
  });
  return Response.json(result);
}
