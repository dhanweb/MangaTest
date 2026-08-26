import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { bootstrapDatabase } from "./bootstrap";
import { getSqlite } from "./client";

export interface SqliteBackupDownload {
  data: Buffer;
  filename: string;
  sizeBytes: number;
}

export interface SqliteBackupArtifact {
  path: string;
  filename: string;
  sizeBytes: number;
}

export async function createSqliteBackupFile(): Promise<SqliteBackupArtifact> {
  bootstrapDatabase();

  const sqlite = getSqlite();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDirectory = path.join(os.tmpdir(), "mangatest-backups");
  const filename = `mangatest-${timestamp}.sqlite`;
  const destination = path.join(backupDirectory, filename);

  await mkdir(backupDirectory, { recursive: true });
  await sqlite.backup(destination);
  const data = await readFile(destination);

  return {
    path: destination,
    filename,
    sizeBytes: data.byteLength,
  };
}

export async function createSqliteBackupDownload(): Promise<SqliteBackupDownload> {
  const artifact = await createSqliteBackupFile();

  try {
    const data = await readFile(artifact.path);

    return {
      data,
      filename: artifact.filename,
      sizeBytes: data.byteLength,
    };
  } finally {
    await rm(artifact.path, { force: true });
  }
}
