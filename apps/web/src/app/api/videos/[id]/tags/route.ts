import { addVideoTag, listVideoTags, removeVideoTag } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({ tags: await listVideoTags(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  try { return Response.json({ tags: await addVideoTag(id, { tagId: typeof payload?.tagId === "string" ? payload.tagId : undefined, name: typeof payload?.name === "string" ? payload.name : undefined, displayNameZh: typeof payload?.displayNameZh === "string" ? payload.displayNameZh : undefined }) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "添加标签失败。" }, { status: 400 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  if (typeof payload?.tagId !== "string") return Response.json({ error: "tagId 必填。" }, { status: 400 });
  return Response.json({ tags: await removeVideoTag(id, payload.tagId) });
}
