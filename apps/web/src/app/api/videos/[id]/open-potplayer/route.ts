import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

import { getRuntimeSettings } from "@/modules/core/settings";
import { createVideoRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const episodeId = typeof payload?.episodeId === "string" ? payload.episodeId : "";
  const episode = await createVideoRepository().getEpisode(episodeId);
  const settings = await getRuntimeSettings();
  if (!episode || episode.videoId !== id || episode.isMissing) return Response.json({ error: "视频集数不存在。" }, { status: 404 });
  if (!settings.potplayerExecutablePath) return Response.json({ error: "请先在系统设置中配置 PotPlayer 路径。" }, { status: 400 });
  if (!(await stat(settings.potplayerExecutablePath).catch(() => null))?.isFile()) return Response.json({ error: "PotPlayer 路径不存在。" }, { status: 400 });
  if (!(await stat(episode.absolutePath).catch(() => null))?.isFile()) return Response.json({ error: "视频文件不存在。" }, { status: 404 });

  const child = spawn(settings.potplayerExecutablePath, [episode.absolutePath], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return Response.json({ ok: true, message: "已请求 PotPlayer 打开视频。" });
}
