import { createComicRepository } from "@/modules/library/comics.repository";
import { createTagRepository } from "@/modules/tags/tags.repository";

import { ComicsPanel } from "./comics-panel";

export const dynamic = "force-dynamic";

export default async function ComicsPage({ searchParams }: { searchParams?: Promise<{ edit?: string }> }) {
  const params = await searchParams;
  const [comics, tags] = await Promise.all([createComicRepository().listAdminRows(), createTagRepository().listWithCounts()]);

  return <ComicsPanel availableTags={tags} comics={comics} initialEditComicId={params?.edit} />;
}
