import { listDownloadableResources, listDownloadTasks, planNextDownloadDispatch } from "@/modules/downloads";

import { DownloadsPanel } from "./downloads-panel";

export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const [resources, tasks, dispatchPlan] = await Promise.all([
    listDownloadableResources(),
    listDownloadTasks(),
    planNextDownloadDispatch(),
  ]);

  return <DownloadsPanel resources={resources} tasks={tasks} dispatchPlan={dispatchPlan} />;
}
