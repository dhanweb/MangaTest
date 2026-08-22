import { scanVideoRoot } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return Response.json({ result: await scanVideoRoot(id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "扫描视频根目录失败。" }, { status: 400 });
  }
}
