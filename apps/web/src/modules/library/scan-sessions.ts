import { randomUUID } from "node:crypto";

export interface ScanSessionRecord {
  id: string;
  mangaRootId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancel_requested" | "canceled";
  startedAt: string | null;
  finishedAt: string | null;
  addedCount: number;
  missingCount: number;
  duplicateCandidateCount: number;
  recoverableCount: number;
  errorSummary: string | null;
}

export function createQueuedScanSession(mangaRootId: string): ScanSessionRecord {
  return {
    id: randomUUID(),
    mangaRootId,
    status: "queued",
    startedAt: null,
    finishedAt: null,
    addedCount: 0,
    missingCount: 0,
    duplicateCandidateCount: 0,
    recoverableCount: 0,
    errorSummary: null,
  };
}
