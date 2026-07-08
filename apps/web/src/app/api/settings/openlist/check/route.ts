import { checkOpenListConnection } from "@/modules/downloads/providers/openlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ result: await checkOpenListConnection() });
}
