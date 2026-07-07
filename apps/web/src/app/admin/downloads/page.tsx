import { listDownloadableResources, listDownloadTaskEvents, listDownloadTasks } from "@/modules/downloads";

import { DownloadsPanel } from "./downloads-panel";

export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const [resources, tasks, events] = await Promise.all([listDownloadableResources(), listDownloadTasks(), listDownloadTaskEvents()]);

  return <DownloadsPanel resources={resources} tasks={tasks} events={events} />;
}
