import { createFileMaintenanceRepository } from "@/modules/local-files";

import { FilesPanel } from "./files-panel";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const issues = await createFileMaintenanceRepository().listIssues();

  return <FilesPanel issues={issues} />;
}
