import { revalidatePath } from "next/cache";

import { createCollectionRepository, type CollectionSortMode } from "@/modules/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION_SORT_MODES = new Set<CollectionSortMode>(["manual", "recent_added", "title"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const collection = await createCollectionRepository().getDetail(id);
    if (!collection) {
      return Response.json({ error: "找不到收藏夹。" }, { status: 404 });
    }
    return Response.json({ collection });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取收藏夹失败。" }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string | null;
    sortMode?: string;
    isEnabled?: boolean;
  } | null;

  if (!payload) {
    return Response.json({ error: "请求体无效。" }, { status: 400 });
  }

  const sortMode: CollectionSortMode | undefined =
    payload.sortMode && COLLECTION_SORT_MODES.has(payload.sortMode as CollectionSortMode)
      ? (payload.sortMode as CollectionSortMode)
      : undefined;

  try {
    const collection = await createCollectionRepository().update(id, {
      name: typeof payload.name === "string" ? payload.name : undefined,
      description: payload.description,
      sortMode,
      isEnabled: typeof payload.isEnabled === "boolean" ? payload.isEnabled : undefined,
    });

    revalidatePath("/admin");
    revalidatePath("/collections");
    revalidatePath(`/collections/${id}`);

    return Response.json({ collection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新收藏夹失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await createCollectionRepository().remove(id);

    revalidatePath("/admin");
    revalidatePath("/collections");

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除收藏夹失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
