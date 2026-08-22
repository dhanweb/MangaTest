import { Container } from "@mantine/core";

import { VideoLibraryHome } from "@/app/(site)/videos/video-library-home";
import { createVideoRepository } from "@/modules/video-library";

export const dynamic = "force-dynamic";

export default async function VideosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const tags = toArray(params.tag);
  const page = Number(typeof params.page === "string" ? params.page : "1");
  const repository = createVideoRepository();
  const [result, tagFilters] = await Promise.all([
    repository.searchReadableCards({ query, tags, page, pageSize: 48 }),
    repository.listReadableTagFilters(),
  ]);
  return <Container fluid p={0}><VideoLibraryHome initialQuery={query} initialSelectedTags={tags} result={result} tagFilters={tagFilters} /></Container>;
}

function toArray(value: string | string[] | undefined) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
