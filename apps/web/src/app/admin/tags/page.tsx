import { createTagRepository } from "@/modules/tags/tags.repository";

import { TagsPanel } from "./tags-panel";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const tags = await createTagRepository().listWithCounts();

  return <TagsPanel tags={tags} />;
}
