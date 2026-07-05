import { Box } from "@mantine/core";

import { ReaderView } from "@/components/reader-view";
import { getRuntimeSettings } from "@/modules/core/settings";
import { createComicRepository } from "@/modules/library/comics.repository";

export const dynamic = "force-dynamic";

export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [comic, settings] = await Promise.all([createComicRepository().getReaderData(id), getRuntimeSettings()]);

  if (!comic) {
    return (
      <Box component="main" className="reader-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box component="p" style={{ color: "rgba(255,255,255,0.6)" }}>
          找不到该漫画。
        </Box>
      </Box>
    );
  }

  return (
    <ReaderView
      comic={comic}
      preferences={{
        readerImmersiveDefault: settings.readerImmersiveDefault,
        readerPreloadAheadPages: settings.readerPreloadAheadPages,
        readerPreloadEnabled: settings.readerPreloadEnabled,
        readerThumbnailSidebarDefault: settings.readerThumbnailSidebarDefault,
      }}
    />
  );
}
