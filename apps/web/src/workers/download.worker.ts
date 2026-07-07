import { runDownloadWorkerTick } from "@/modules/downloads";

export async function runDownloadWorkerOnce() {
  return runDownloadWorkerTick();
}
