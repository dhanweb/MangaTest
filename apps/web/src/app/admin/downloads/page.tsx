import { listDownloadableResources, listOpenListCloudScans, listDownloadTaskEvents, listDownloadTasks, planNextDownloadDispatch } from "@/modules/downloads";

import { DownloadsPanel } from "./downloads-panel";

export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const [resources, tasks, events, dispatchPlan, cloudScans] = await Promise.all([
    listDownloadableResources(),
    listDownloadTasks(),
    listDownloadTaskEvents(),
    planNextDownloadDispatch(),
    listOpenListCloudScans(),
  ]);

  return <DownloadsPanel resources={resources} tasks={tasks} events={events} dispatchPlan={dispatchPlan} cloudScans={cloudScans} />;
}
