import { createCollectionRepository } from "@/modules/collections";

import { CollectionsPanel } from "./collections-panel";

export const dynamic = "force-dynamic";

export default async function CollectionsAdminPage() {
  const [collections, events] = await Promise.all([
    createCollectionRepository().list(),
    createCollectionRepository().listEvents(),
  ]);

  return <CollectionsPanel collections={collections} events={events} />;
}
