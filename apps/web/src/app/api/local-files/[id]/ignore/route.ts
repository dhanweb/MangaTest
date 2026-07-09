import { revalidatePath } from "next/cache";

import { createFileMaintenanceRepository } from "@/modules/local-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await createFileMaintenanceRepository().ignoreMissingIssue(id);

    revalidatePath("/admin");
    revalidatePath("/admin/files");

    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "忽略缺失文件问题失败。" }, { status: 400 });
  }
}
