import { revalidatePath } from "next/cache";

import { createFileMaintenanceRepository } from "@/modules/local-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await createFileMaintenanceRepository().recheckMissingFiles();

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/files");

    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "重新检查缺失文件失败。" }, { status: 500 });
  }
}
