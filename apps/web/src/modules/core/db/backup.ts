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

export async function createSqliteBackupDownload(): Promise<SqliteBackupDownload> {
  bootstrapDatabase();

  const sqlite = getSqlite();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDirectory = path.join(os.tmpdir(), "mangatest-backups");
  const filename = `mangatest-${timestamp}.sqlite`;
  const destination = path.join(backupDirectory, filename);

  await mkdir(backupDirectory, { recursive: true });

  try {
    await sqlite.backup(destination);
    const data = await readFile(destination);

    return {
      data,
      filename,
      sizeBytes: data.byteLength,
    };
  } finally {
    await rm(destination, { force: true });
  }
}
