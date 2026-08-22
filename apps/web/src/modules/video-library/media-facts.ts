import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

export async function probeVideoDurationSeconds(filePath: string) {
  const output = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  if (output.exitCode !== 0) return null;
  const seconds = Number.parseFloat(output.stdout.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null;
}

export async function ensureVideoPoster(filePath: string, cacheDirectory: string, cacheKey: string) {
  const safeKey = cacheKey.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const directory = path.resolve(cacheDirectory, "video-covers");
  const outputPath = path.join(directory, `${safeKey}.jpg`);
  if ((await stat(outputPath).catch(() => null))?.isFile()) return outputPath;

  await mkdir(directory, { recursive: true });
  const result = await runCommand("ffmpeg", [
    "-y",
    "-ss",
    "1",
    "-i",
    filePath,
    "-frames:v",
    "1",
    "-vf",
    "scale=480:-2",
    "-q:v",
    "4",
    outputPath,
  ]);
  return result.exitCode === 0 && (await stat(outputPath).catch(() => null))?.isFile() ? outputPath : null;
}

function runCommand(command: string, args: string[]) {
  return new Promise<{ exitCode: number; stdout: string }>((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve({ exitCode: -1, stdout }));
    child.on("close", (code) => resolve({ exitCode: code ?? -1, stdout }));
  });
}
