import { previewPathMigration } from "@/modules/library/path-migration";

import { migrationErrorResponse, parsePreviewRequest } from "../request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = parsePreviewRequest(await request.json());
    const report = await previewPathMigration(input);
    return Response.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return migrationErrorResponse(error);
  }
}
