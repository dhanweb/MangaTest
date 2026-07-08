import { revalidatePath } from "next/cache";

import { importOpenListCloudScanResources, listOpenListCloudScans } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await importOpenListCloudScanResources(id);
    const cloudScans = await listOpenListCloudScans();

    revalidatePath("/admin/downloads");

    return Response.json({ ...result, cloudScans });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "导入 OpenList 云端扫描资源失败。" }, { status: 400 });
  }
}
