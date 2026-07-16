import { revalidatePath } from "next/cache";

import { rescanOpenListLibraryIndexAndRecover } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Force library index scan can walk a large OpenList root. */
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await rescanOpenListLibraryIndexAndRecover();

    revalidatePath("/admin");
    revalidatePath("/admin/downloads");

    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "强制重扫云端库失败。" },
      { status: 400 },
    );
  }
}
