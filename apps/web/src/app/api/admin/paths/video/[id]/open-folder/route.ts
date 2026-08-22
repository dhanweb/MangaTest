import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

import { createVideoRootRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const root = (await createVideoRootRepository().list()).find((item) => item.id === id);
  if (!root || !(await stat(root.absolutePath).catch(() => null))?.isDirectory()) return Response.json({ error: "视频目录不存在。" }, { status: 404 });
  const child = spawn("explorer.exe", [root.absolutePath], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return Response.json({ ok: true });
}
