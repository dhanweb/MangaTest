import { revalidatePath } from "next/cache";

import { createTransferTaskFromOfflineTask, getDownloadTaskById } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const offlineTask = getDownloadTaskById(id);

    if (!offlineTask) {
      return Response.json({ error: "找不到下载任务。", code: "task_not_found" }, { status: 404 });
    }

    if (offlineTask.taskType !== "offline") {
      return Response.json(
        {
          error: "只能对离线任务执行拉回操作。",
          code: "not_offline_task",
          details: { taskType: offlineTask.taskType },
        },
        { status: 400 },
      );
    }

    const result = await createTransferTaskFromOfflineTask(offlineTask);

    if (!result.ok) {
      return Response.json(
        {
          error: result.message,
          code: result.code,
          details: result.details,
        },
        { status: 400 },
      );
    }

    revalidatePath("/admin");
    revalidatePath("/admin/downloads");

    return Response.json({
      created: true,
      transferTask: result.task,
      message: result.message,
      details: result.details,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "拉回本地失败。";
    console.warn("[downloads/pull-back] unexpected error", error);
    return Response.json({ error: message, code: "unexpected_error" }, { status: 400 });
  }
}
