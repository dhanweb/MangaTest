import { getDataResetSummary, resetApplicationData } from "@/modules/core/data-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ summary: await getDataResetSummary() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取数据清理摘要失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as {
      clearCache?: unknown;
      clearLibrary?: unknown;
      clearDownloads?: unknown;
      confirm?: unknown;
    } | null;

    if (!payload || typeof payload !== "object") {
      return Response.json({ error: "无效的请求体。" }, { status: 400 });
    }

    if (payload.confirm !== true) {
      return Response.json({ error: "请确认清空操作（confirm: true）。" }, { status: 400 });
    }

    const options = {
      clearCache: payload.clearCache === true,
      clearLibrary: payload.clearLibrary === true,
      clearDownloads: payload.clearDownloads === true,
    };

    if (!options.clearCache && !options.clearLibrary && !options.clearDownloads) {
      return Response.json({ error: "请至少选择一项要清空的内容。" }, { status: 400 });
    }

    const result = await resetApplicationData(options);
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "清空数据失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
