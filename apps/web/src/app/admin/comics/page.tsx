import { createComicRepository } from "@/modules/library/comics.repository";

import { ComicsPanel } from "./comics-panel";

export const dynamic = "force-dynamic";

export default async function ComicsPage() {
  const comics = await createComicRepository().listAdminRows();

  return <ComicsPanel comics={comics} />;
}
