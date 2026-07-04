import { saveReadingProgress } from "@/modules/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload.pageId !== "string") {
    return Response.json({ error: "pageId is required." }, { status: 400 });
  }

  const progressPercent = typeof payload.progressPercent === "number" ? payload.progressPercent : 0;
  const progress = await saveReadingProgress({
    pageId: payload.pageId,
    progressPercent,
  });

  if (!progress) {
    return Response.json({ error: "Page not found." }, { status: 404 });
  }

  return Response.json({ progress });
}
