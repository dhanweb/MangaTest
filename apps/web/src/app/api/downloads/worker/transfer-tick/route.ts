import { revalidatePath } from "next/cache";

import { runTransferWorkerTick } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runTransferWorkerTick();

    revalidatePath("/admin");
    revalidatePath("/admin/downloads");

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "传输 worker 预检失败。" }, { status: 400 });
  }
}
