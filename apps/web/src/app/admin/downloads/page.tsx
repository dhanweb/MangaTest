import { listDownloadableResources, listDownloadTasks } from "@/modules/downloads";

import { DownloadsPanel } from "./downloads-panel";

export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const [resources, tasks] = await Promise.all([listDownloadableResources(), listDownloadTasks()]);

  return <DownloadsPanel resources={resources} tasks={tasks} />;
}
