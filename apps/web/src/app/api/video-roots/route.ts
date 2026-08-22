import { createVideoRootRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ roots: await createVideoRootRepository().listWithStats() });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.absolutePath !== "string") return Response.json({ error: "absolutePath 必填。" }, { status: 400 });
  try {
    const root = await createVideoRootRepository().create({ absolutePath: payload.absolutePath, displayName: typeof payload.displayName === "string" ? payload.displayName : undefined });
    return Response.json({ root }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存视频根目录失败。" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.id !== "string") return Response.json({ error: "id 必填。" }, { status: 400 });
  try {
    const root = await createVideoRootRepository().updateSettings({ id: payload.id, displayName: typeof payload.displayName === "string" ? payload.displayName : undefined, isEnabled: payload.isEnabled !== false });
    return Response.json({ root });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新视频根目录失败。" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.id !== "string") return Response.json({ error: "id 必填。" }, { status: 400 });
  try {
    await createVideoRootRepository().deleteUnused(payload.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "删除视频根目录失败。" }, { status: 400 });
  }
}
