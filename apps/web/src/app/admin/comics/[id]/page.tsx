import { notFound } from "next/navigation";

import { createComicRepository } from "@/modules/library/comics.repository";
import { createTagRepository } from "@/modules/tags/tags.repository";

import { ComicAdminDetailPanel } from "./comic-admin-detail-panel";

export const dynamic = "force-dynamic";

export default async function ComicAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [comics, tags] = await Promise.all([createComicRepository().listAdminRows(), createTagRepository().listWithCounts()]);
  const comic = comics.find((item) => item.id === id);

  if (!comic) {
    notFound();
  }

  return <ComicAdminDetailPanel availableTags={tags} comic={comic} comics={comics} />;
}
