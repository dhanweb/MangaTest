import { createComicRepository } from "@/modules/library/comics.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 96;

export async function GET(request: Request, { params }: { params: Promise<{ comicId: string }> }) {
  const { comicId } = await params;
  const url = new URL(request.url);
  const start = parseInteger(url.searchParams.get("start"), 0);
  const limit = parseInteger(url.searchParams.get("limit"), DEFAULT_LIMIT);

  if (start === null || limit === null || start < 0 || limit < 1 || limit > MAX_LIMIT) {
    return Response.json(
      { error: "start must be a non-negative integer and limit must be between 1 and 96." },
      { status: 400 },
    );
  }

  const result = await createComicRepository().getReaderPageWindow(comicId, start, limit);
  if (!result) {
    return Response.json({ error: "Comic not found." }, { status: 404 });
  }

  return Response.json(result, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    },
  });
}

function parseInteger(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
