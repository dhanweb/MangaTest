import { listDownloadableResources, listDownloadTaskEvents, listDownloadTasks, planNextDownloadDispatch } from "@/modules/downloads";

import { DownloadsPanel } from "./downloads-panel";

export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const [resources, tasks, events, dispatchPlan] = await Promise.all([
    listDownloadableResources(),
    listDownloadTasks(),
    listDownloadTaskEvents(),
    planNextDownloadDispatch(),
  ]);

  return <DownloadsPanel resources={resources} tasks={tasks} events={events} dispatchPlan={dispatchPlan} />;
}
