import { createComicRepository } from "@/modules/library/comics.repository";

import { ComicsPanel } from "./comics-panel";

export const dynamic = "force-dynamic";

export default async function ComicsPage() {
  // Soft-deleted comics (e.g. mistaken "下载入库" folder comic) are not returned.
  const comics = await createComicRepository().listAdminRows(200);

  return <ComicsPanel comics={comics} />;
}
