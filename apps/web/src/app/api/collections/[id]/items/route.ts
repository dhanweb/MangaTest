import { revalidatePath } from "next/cache";

import { createCollectionRepository } from "@/modules/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as { comicId?: string } | null;

  if (!payload || typeof payload.comicId !== "string" || !payload.comicId.trim()) {
    return Response.json({ error: "comicId 不能为空。" }, { status: 400 });
  }

  try {
    const collection = await createCollectionRepository().addComic(id, payload.comicId);

    revalidatePath("/admin");
    revalidatePath("/collections");
    revalidatePath(`/collections/${id}`);

    return Response.json({ collection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "加入收藏夹失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const comicId = url.searchParams.get("comicId");

  if (!comicId) {
    return Response.json({ error: "comicId 不能为空。" }, { status: 400 });
  }

  try {
    const collection = await createCollectionRepository().removeComic(id, comicId);

    revalidatePath("/admin");
    revalidatePath("/collections");
    revalidatePath(`/collections/${id}`);

    return Response.json({ collection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "移出收藏夹失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as { comicIds?: string[] } | null;

  if (!payload || !Array.isArray(payload.comicIds)) {
    return Response.json({ error: "comicIds 列表无效。" }, { status: 400 });
  }

  try {
    const collection = await createCollectionRepository().reorder(id, payload.comicIds);

    revalidatePath(`/collections/${id}`);

    return Response.json({ collection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重新排序失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
