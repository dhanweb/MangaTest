import { openMangaRootInFileManager } from "@/modules/library/open-manga-root-folder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const result = await openMangaRootInFileManager(id);
    if (!result.ok) {
      const status = result.code === "root_not_found" ? 404 : 400;
      return Response.json({ error: result.message, code: result.code }, { status });
    }

    return Response.json({
      ok: true,
      openedPath: result.openedPath,
      message: result.message,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "打开文件管理器失败。",
        code: "unexpected_error",
      },
      { status: 400 },
    );
  }
}
