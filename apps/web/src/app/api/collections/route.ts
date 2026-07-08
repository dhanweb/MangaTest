import { revalidatePath } from "next/cache";

import {
  createCollectionRepository,
  type CollectionKind,
  type CollectionSortMode,
} from "@/modules/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION_KINDS = new Set<CollectionKind>(["collection", "queue"]);
const COLLECTION_SORT_MODES = new Set<CollectionSortMode>(["manual", "recent_added", "title"]);

export async function GET() {
  try {
    const repository = createCollectionRepository();
    const [collections, events] = await Promise.all([repository.list(), repository.listEvents()]);
    return Response.json({ collections, events });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取收藏夹失败。" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string;
    kind?: string;
    sortMode?: string;
  } | null;

  if (!payload || typeof payload.name !== "string" || !payload.name.trim()) {
    return Response.json({ error: "收藏夹名称不能为空。" }, { status: 400 });
  }

  const kind: CollectionKind | undefined =
    payload.kind && COLLECTION_KINDS.has(payload.kind as CollectionKind) ? (payload.kind as CollectionKind) : undefined;
  const sortMode: CollectionSortMode | undefined =
    payload.sortMode && COLLECTION_SORT_MODES.has(payload.sortMode as CollectionSortMode)
      ? (payload.sortMode as CollectionSortMode)
      : undefined;

  try {
    const collection = await createCollectionRepository().create({
      name: payload.name,
      description: typeof payload.description === "string" ? payload.description : undefined,
      kind,
      sortMode,
    });

    revalidatePath("/admin");
    revalidatePath("/collections");

    return Response.json({ collection });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "创建收藏夹失败。" }, { status: 400 });
  }
}
