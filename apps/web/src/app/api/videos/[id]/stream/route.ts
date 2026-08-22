import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { createVideoRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episodeId = new URL(request.url).searchParams.get("episodeId");
  if (!episodeId) return new Response("episodeId is required.", { status: 400 });
  const episode = await createVideoRepository().getEpisode(episodeId);
  if (!episode || episode.videoId !== id || episode.isMissing) return new Response("Video episode not found.", { status: 404 });
  const fileInfo = await stat(episode.absolutePath).catch(() => null);
  if (!fileInfo?.isFile()) return new Response("Video file not found.", { status: 404 });

  const range = parseRange(request.headers.get("range"), fileInfo.size);
  const stream = createReadStream(episode.absolutePath, { start: range.start, end: range.end });
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Length": String(range.end - range.start + 1),
    "Content-Type": contentType(episode.extension),
    "Cache-Control": "private, max-age=3600",
  });
  if (range.partial) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${fileInfo.size}`);
    return new Response(Readable.toWeb(stream) as unknown as BodyInit, { status: 206, headers });
  }
  return new Response(Readable.toWeb(stream) as unknown as BodyInit, { headers });
}

function parseRange(value: string | null, size: number) {
  if (!value?.startsWith("bytes=")) return { start: 0, end: size - 1, partial: false };
  const [startText, endText] = value.slice(6).split("-", 2);
  const start = Number.parseInt(startText, 10);
  const requestedEnd = Number.parseInt(endText, 10);
  if (!Number.isFinite(start) || start < 0 || start >= size) return { start: 0, end: size - 1, partial: false };
  const end = Number.isFinite(requestedEnd) ? Math.min(requestedEnd, size - 1) : size - 1;
  return { start, end: Math.max(start, end), partial: true };
}

function contentType(extension: string) {
  const map: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4", mkv: "video/x-matroska", avi: "video/x-msvideo", ts: "video/mp2t" };
  return map[extension.toLowerCase()] ?? "application/octet-stream";
}
