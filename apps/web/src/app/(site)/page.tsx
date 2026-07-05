import { createComicRepository } from "@/modules/library/comics.repository";

import { LibraryHome } from "./library-home";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    tag?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const sort = params.sort === "title" || params.sort === "pages" ? params.sort : "recent";
  const selectedTags = normalizeSelectedTags(Array.isArray(params.tag) ? params.tag : params.tag ? [params.tag] : []);
  const comicRepository = createComicRepository();
  const [result, tagFilters] = await Promise.all([
    comicRepository.searchReadableCards({
      page: Number(params.page ?? 1),
      pageSize: 48,
      query: params.q,
      sort,
      tags: selectedTags,
    }),
    comicRepository.listReadableTagFilters(),
  ]);

  return <LibraryHome initialQuery={params.q ?? ""} initialSelectedTags={selectedTags} initialSort={sort} result={result} tagFilters={tagFilters} />;
}

function normalizeSelectedTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))).slice(0, 12);
}
