import { revalidatePath } from "next/cache";
import { deleteDownloadTask } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteDownloadTask(id);
    revalidatePath("/admin/downloads");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "删除下载任务失败。" }, { status: 400 });
  }
}
