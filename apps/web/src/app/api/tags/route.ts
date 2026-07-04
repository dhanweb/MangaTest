import { createTagRepository } from "@/modules/tags/tags.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const input = parseTagPayload(payload);

  if (!input) {
    return Response.json({ error: "namespace and name are required." }, { status: 400 });
  }

  try {
    const tag = await createTagRepository().create(input);
    return Response.json({ tag });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to create tag." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const input = parseTagPayload(payload);

  if (!payload || typeof payload.id !== "string" || !input) {
    return Response.json({ error: "id, namespace and name are required." }, { status: 400 });
  }

  try {
    const tag = await createTagRepository().update(payload.id, input);
    if (!tag) {
      return Response.json({ error: "Tag not found." }, { status: 404 });
    }

    return Response.json({ tag });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to update tag." }, { status: 400 });
  }
}

function parseTagPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.namespace !== "string" || typeof record.name !== "string") {
    return null;
  }

  return {
    namespace: record.namespace,
    name: record.name,
    displayNameZh: typeof record.displayNameZh === "string" ? record.displayNameZh : null,
  };
}
