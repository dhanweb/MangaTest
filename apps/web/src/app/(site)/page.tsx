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
  }>;
}) {
  const params = await searchParams;
  const sort = params.sort === "title" || params.sort === "pages" ? params.sort : "recent";
  const result = await createComicRepository().searchReadableCards({
    page: Number(params.page ?? 1),
    pageSize: 48,
    query: params.q,
    sort,
  });

  return <LibraryHome initialQuery={params.q ?? ""} initialSort={sort} result={result} />;
}
