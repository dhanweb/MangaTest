import { revalidatePath } from "next/cache";

import { retryDownloadTask } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await retryDownloadTask(id);

    revalidatePath("/admin");
    revalidatePath("/admin/downloads");

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "重试下载任务失败。" }, { status: 400 });
  }
}
