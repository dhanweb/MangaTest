import { createComicMaintenanceRepository, type ComicMaintenanceAction } from "@/modules/library/comic-maintenance.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actions = new Set<ComicMaintenanceAction>(["hide", "soft_delete", "restore"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = (await request.json()) as { action?: string };

  if (!payload.action || !actions.has(payload.action as ComicMaintenanceAction)) {
    return Response.json({ error: "无效的漫画维护操作。" }, { status: 400 });
  }

  try {
    const comic = await createComicMaintenanceRepository().changeStatus(id, payload.action as ComicMaintenanceAction);
    return Response.json({ comic });
  } catch (error) {
    const message = error instanceof Error ? error.message : "漫画维护操作失败。";
    const status = message.includes("找不到") ? 404 : 400;

    return Response.json({ error: message }, { status });
  }
}
