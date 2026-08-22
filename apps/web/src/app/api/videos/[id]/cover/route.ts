import { getRuntimeSettings } from "@/modules/core/settings";
import { ensureVideoPoster, createVideoRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await createVideoRepository().getDetail(id);
  const episode = video?.episodes.find((item) => !item.isMissing);
  if (!episode) return placeholderResponse();

  const settings = await getRuntimeSettings();
  const posterPath = await ensureVideoPoster(episode.absolutePath, settings.cacheDirectory, `${id}-${episode.id}`);
  if (!posterPath) return placeholderResponse();

  const { readFile } = await import("node:fs/promises");
  return new Response(new Uint8Array(await readFile(posterPath)), {
    headers: { "Cache-Control": "private, max-age=86400", "Content-Type": "image/jpeg" },
  });
}

function placeholderResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#251a2d"/><circle cx="480" cy="248" r="62" fill="#d83f91" opacity=".9"/><path d="M458 212v72l62-36z" fill="#fff"/><text x="480" y="390" fill="#ffd2e7" font-family="Arial,sans-serif" font-size="28" text-anchor="middle">VIDEO</text></svg>`;
  return new Response(svg, {
    headers: { "Cache-Control": "private, max-age=3600", "Content-Type": "image/svg+xml" },
  });
}
