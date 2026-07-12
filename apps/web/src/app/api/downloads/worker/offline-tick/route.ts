import { revalidatePath } from "next/cache";

import { runOfflineWorkerTick } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runOfflineWorkerTick();

    revalidatePath("/admin");
    revalidatePath("/admin/downloads");

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "离线 worker 预检失败。" }, { status: 400 });
  }
}
