import { createComicRepository } from "@/modules/library/comics.repository";

import { LibraryHome } from "./library-home";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const comics = await createComicRepository().listReadableCards(200);

  return <LibraryHome comics={comics} />;
}
