import { Box } from "@mantine/core";

import { ReaderView } from "@/components/reader-view";
import { createComicRepository } from "@/modules/library/comics.repository";

export const dynamic = "force-dynamic";

export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comic = await createComicRepository().getReaderData(id);

  if (!comic) {
    return (
      <Box component="main" className="reader-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box component="p" style={{ color: "rgba(255,255,255,0.6)" }}>
          找不到该漫画。
        </Box>
      </Box>
    );
  }

  return <ReaderView comic={comic} />;
}
