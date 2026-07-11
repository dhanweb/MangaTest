import { checkAria2Connectivity } from "@/modules/downloads/providers/aria2/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { rpcUrl?: string; rpcToken?: string } | null;
  const rpcUrl = payload?.rpcUrl?.trim() || "";
  const rpcToken = payload?.rpcToken?.trim() || undefined;

  if (!rpcUrl) {
    return Response.json({
      result: { ok: false, message: "aria2 RPC 地址未填写。" },
    });
  }

  const result = await checkAria2Connectivity(rpcUrl, rpcToken);
  return Response.json({ result });
}
