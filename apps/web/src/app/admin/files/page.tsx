import { createFileMaintenanceRepository } from "@/modules/local-files";
import { createDuplicateCandidateRepository } from "@/modules/library";

import { FilesPanel } from "./files-panel";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const [issues, duplicateGroups] = await Promise.all([createFileMaintenanceRepository().listIssues(), createDuplicateCandidateRepository().listGroups()]);

  return <FilesPanel duplicateGroups={duplicateGroups} issues={issues} />;
}
