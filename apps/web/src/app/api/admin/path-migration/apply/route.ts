import { applyPathMigration } from "@/modules/library/path-migration";

import { migrationErrorResponse, parseApplyRequest } from "../request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = parseApplyRequest(await request.json());
    const result = await applyPathMigration(input);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return migrationErrorResponse(error);
  }
}
