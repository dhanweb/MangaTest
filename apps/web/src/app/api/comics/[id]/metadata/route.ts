import { createComicMetadataRepository } from "@/modules/library/comic-metadata.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as {
    displayTitle?: unknown;
    metadataQueryTitle?: unknown;
    originalTitle?: unknown;
  } | null;

  if (typeof payload?.displayTitle !== "string") {
    return Response.json({ error: "displayTitle is required." }, { status: 400 });
  }

  try {
    const comic = await createComicMetadataRepository().updateMetadata(id, {
      displayTitle: payload.displayTitle,
      metadataQueryTitle: typeof payload.metadataQueryTitle === "string" ? payload.metadataQueryTitle : null,
      originalTitle: typeof payload.originalTitle === "string" ? payload.originalTitle : null,
    });

    return Response.json({ comic });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新漫画元数据失败。";
    const status = message.includes("找不到") ? 404 : 400;

    return Response.json({ error: message }, { status });
  }
}
