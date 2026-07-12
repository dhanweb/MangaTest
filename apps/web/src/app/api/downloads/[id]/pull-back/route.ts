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
      return Response.json({ error: "找不到下载任务。" }, { status: 404 });
    }

    if (offlineTask.taskType !== "offline") {
      return Response.json({ error: "只能对离线任务执行拉回操作。" }, { status: 400 });
    }

    const transferTask = await createTransferTaskFromOfflineTask(offlineTask);

    if (!transferTask) {
      return Response.json({ error: "创建传输任务失败，请确认 OpenList 设置正确且文件存在。" }, { status: 400 });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/downloads");

    return Response.json({ created: true, transferTask });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "拉回本地失败。" }, { status: 400 });
  }
}
