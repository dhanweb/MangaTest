import { revalidatePath } from "next/cache";

import { scanAllEnabledMangaRoots } from "@/modules/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await scanAllEnabledMangaRoots();

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/files");
    revalidatePath("/admin/paths");

    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "扫描漫画根目录失败。" }, { status: 500 });
  }
}
