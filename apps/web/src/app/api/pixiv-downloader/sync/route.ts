import { revalidatePath } from "next/cache";

import { runPixivDownloaderSync } from "@/modules/metadata-ingest/sources/pixiv-downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { scanFirst?: unknown } | null;
  const scanFirst = Boolean(payload?.scanFirst);

  try {
    const result = await runPixivDownloaderSync({ scanFirst });

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/comics");

    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "同步失败。" }, { status: 400 });
  }
}
