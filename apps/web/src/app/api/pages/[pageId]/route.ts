import { readReaderPageImage } from "@/modules/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const image = await readReaderPageImage(pageId);

  if (!image) {
    return new Response("Page image not found.", { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${encodeURIComponent(image.fileName)}"`,
      "Content-Type": image.contentType,
    },
  });
}
