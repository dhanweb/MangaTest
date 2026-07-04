import { createFileMaintenanceRepository } from "@/modules/local-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload.absolutePath !== "string") {
    return Response.json({ error: "absolutePath is required." }, { status: 400 });
  }

  try {
    const result = await createFileMaintenanceRepository().repairMissingPath(id, payload.absolutePath);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "修复路径失败。" }, { status: 400 });
  }
}
