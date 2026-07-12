import { revalidatePath } from "next/cache";

import {
  createDownloadTask,
  listDownloadableResources,
  listOpenListCloudScans,
  listDownloadTaskEvents,
  listDownloadTasks,
  planNextDownloadDispatch,
  type DownloadProvider,
  type DownloadTaskType,
} from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [resources, tasks, events, dispatchPlan, cloudScans] = await Promise.all([
    listDownloadableResources(),
    listDownloadTasks(),
    listDownloadTaskEvents(),
    planNextDownloadDispatch(),
    listOpenListCloudScans(),
  ]);

  const offlineTasks = tasks.filter((t) => t.taskType === "offline");
  const transferTasks = tasks.filter((t) => t.taskType === "transfer");

  return Response.json({ resources, tasks, offlineTasks, transferTasks, events, dispatchPlan, cloudScans });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = parseCreateDownloadTaskPayload(payload);

  if (!parsed.input) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await createDownloadTask(parsed.input);

    revalidatePath("/admin");
    revalidatePath("/admin/downloads");

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "创建下载任务失败。" }, { status: 400 });
  }
}

function parseCreateDownloadTaskPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { input: null, error: "comicResourceId is required." };
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.comicResourceId !== "string" || !record.comicResourceId.trim()) {
    return { input: null, error: "comicResourceId is required." };
  }

  const provider = record.provider;

  if (provider != null && !isDownloadProvider(provider)) {
    return { input: null, error: "provider is invalid." };
  }

  return {
    input: {
      comicResourceId: record.comicResourceId,
      provider: provider ?? undefined,
      taskType: isDownloadTaskType(record.taskType) ? record.taskType : undefined,
      targetDirectory: typeof record.targetDirectory === "string" ? record.targetDirectory : null,
    },
    error: null,
  };
}

function isDownloadProvider(value: unknown): value is DownloadProvider {
  return value === "openlist" || value === "builtin-http" || value === "aria2";
}

function isDownloadTaskType(value: unknown): value is DownloadTaskType {
  return value === "offline" || value === "transfer";
}
