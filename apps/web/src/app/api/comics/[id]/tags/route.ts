import { createComicTagAssignmentRepository } from "@/modules/tags/comic-tags.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const tags = await createComicTagAssignmentRepository().listForComic(id);
    return Response.json({ tags });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取漫画标签失败。" }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tagId = await parseTagId(request);

  if (!tagId) {
    return Response.json({ error: "tagId is required." }, { status: 400 });
  }

  try {
    const tags = await createComicTagAssignmentRepository().addToComic(id, tagId);
    return Response.json({ tags });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "绑定漫画标签失败。" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tagId = await parseTagId(request);

  if (!tagId) {
    return Response.json({ error: "tagId is required." }, { status: 400 });
  }

  try {
    const tags = await createComicTagAssignmentRepository().removeFromComic(id, tagId);
    return Response.json({ tags });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "移除漫画标签失败。" }, { status: 400 });
  }
}

async function parseTagId(request: Request) {
  const payload = (await request.json().catch(() => null)) as { tagId?: unknown } | null;
  return typeof payload?.tagId === "string" && payload.tagId.trim() ? payload.tagId.trim() : null;
}
