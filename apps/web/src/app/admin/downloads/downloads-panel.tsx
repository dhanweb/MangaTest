"use client";

import { Badge, Box, Group, Paper, Select, Stack, Table, Tabs, Text, Tooltip } from "@mantine/core";
import { ArrowDownToLine, CloudDownload, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { AppButton, AppInput } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type {
  DownloadableResourceRecord,
  DownloadDispatchPlan,
  DownloadProvider,
  DownloadTaskRecord,
  DownloadWorkerTickResult,
} from "@/modules/downloads";

const PROVIDER_LABELS: Record<DownloadProvider, string> = {
  aria2: "aria2",
  "builtin-http": "内置 HTTP",
  openlist: "OpenList",
};

const TYPE_LABELS: Record<string, string> = {
  http: "HTTP", magnet: "磁链", openlist: "OpenList", torrent: "Torrent",
};

const STATUS_BADGE: Record<string, [string, string]> = {
  queued: ["排队中", "pink"],
  submitted: ["处理中", "blue"],
  downloading: ["下载中", "blue"],
  running: ["进行中", "blue"],
  completed: ["已完成", "green"],
  failed: ["失败", "red"],
  canceled: ["已取消", "gray"],
  cancel_requested: ["取消中", "yellow"],
};

type ApiData = {
  resources?: DownloadableResourceRecord[];
  tasks?: DownloadTaskRecord[];
  offlineTasks?: DownloadTaskRecord[];
  transferTasks?: DownloadTaskRecord[];
  plan?: DownloadWorkerTickResult["plan"];
  reason?: string;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
  message?: string;
  created?: boolean;
  task?: DownloadTaskRecord;
  transferTask?: DownloadTaskRecord;
};

const TRANSFER_TICK_INTERVAL = 5000;
const OFFLINE_TICK_INTERVAL = 300000;

function StatusBadge({ status }: { status: string }) {
  const [label, color] = STATUS_BADGE[status] ?? [status, "gray"];
  return <Badge color={color} variant="light" size="sm">{label}</Badge>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Box style={{ textAlign: "center", minWidth: 80 }}>
      <Text size="lg" fw={700} c="pink.6">{value}</Text>
      <Text size="xs" c="ink.5">{label}</Text>
    </Box>
  );
}

export function DownloadsPanel({
  dispatchPlan, resources, tasks,
}: {
  dispatchPlan: DownloadDispatchPlan;
  resources: DownloadableResourceRecord[];
  tasks: DownloadTaskRecord[];
}) {
  const [resourceItems, setResourceItems] = useState(resources);
  const [offlineTasks, setOfflineTasks] = useState(tasks.filter((t) => t.taskType === "offline"));
  const [transferTasks, setTransferTasks] = useState(tasks.filter((t) => t.taskType === "transfer"));
  const [planItem, setPlanItem] = useState(dispatchPlan);
  const [activeTab, setActiveTab] = useAdminTabState<string | null>("downloadsActiveTab", "offline");
  const [selectedId, setSelectedId] = useAdminTabState<string | null>("resourceId", resources[0]?.id ?? null);
  const [provider, setProvider] = useAdminTabState<DownloadProvider>("provider", resources[0]?.defaultProvider ?? "openlist");
  const [targetDir, setTargetDir] = useAdminTabState("targetDir", "");
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingTick, setPendingTick] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const selected = useMemo(() => resourceItems.find((r) => r.id === selectedId) ?? null, [resourceItems, selectedId]);
  const providerOpts = useMemo(
    () => (selected?.compatibleProviders ?? []).map((v) => ({ value: v, label: PROVIDER_LABELS[v] })),
    [selected],
  );
  const resourceOpts = useMemo(
    () => resourceItems.map((r) => ({ value: r.id, label: `${r.comicTitle} · ${TYPE_LABELS[r.resourceType]} · ${r.displayLabel}` })),
    [resourceItems],
  );

  const tickingRef = useRef(false);
  const offlineTickingRef = useRef(false);

  async function fetchApi(path: string, opts: RequestInit = {}): Promise<ApiData | null> {
    try {
      const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
      const d = await res.json() as ApiData;
      if (!res.ok) {
        const detailParts: string[] = [];
        if (d.code) detailParts.push(d.code);
        if (d.details && typeof d.details.remotePath === "string") {
          detailParts.push(`path=${d.details.remotePath}`);
        }
        if (d.details && typeof d.details.openlistCode === "number") {
          detailParts.push(`openlist=${d.details.openlistCode}`);
        }
        const suffix = detailParts.length > 0 ? ` [${detailParts.join(", ")}]` : "";
        throw new Error(`${d.error || "请求失败"}${suffix}`);
      }
      return d;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "请求失败");
      return null;
    }
  }

  const refresh = useCallback(async () => {
    const d = await fetchApi("/api/downloads");
    if (d) {
      if (d.resources) setResourceItems(d.resources);
      if (d.offlineTasks) setOfflineTasks(d.offlineTasks);
      if (d.transferTasks) setTransferTasks(d.transferTasks);
      if (d.plan) setPlanItem(d.plan);
      if (d.resources && !d.resources.find((r) => r.id === selectedId)) {
        setSelectedId(d.resources[0]?.id ?? null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const runTransfer = async () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      try {
        const res = await fetch("/api/downloads/worker/transfer-tick", { method: "POST" });
        const d = await res.json() as ApiData;
        if (d.plan) setPlanItem(d.plan);
        await refresh();
      } catch { /* ignore */ }
      tickingRef.current = false;
    };

    const runOffline = async () => {
      if (offlineTickingRef.current) return;
      offlineTickingRef.current = true;
      try {
        const res = await fetch("/api/downloads/worker/offline-tick", { method: "POST" });
        const d = await res.json() as ApiData;
        if (d.plan) setPlanItem(d.plan);
        await refresh();
      } catch { /* ignore */ }
      offlineTickingRef.current = false;
    };

    runTransfer();
    runOffline();
    const transferId = setInterval(runTransfer, TRANSFER_TICK_INTERVAL);
    const offlineId = setInterval(runOffline, OFFLINE_TICK_INTERVAL);
    return () => { clearInterval(transferId); clearInterval(offlineId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTask() {
    if (!selected) return;
    setPendingCreate(true);
    const d = await fetchApi("/api/downloads", {
      method: "POST",
      body: JSON.stringify({ comicResourceId: selected.id, provider, taskType: "offline", targetDirectory: targetDir || null }),
    });
    if (d) {
      if (d.created) toast.success("离线任务已创建");
      else toast.success("已有相同任务，未重复创建");
      await refresh();
    }
    setPendingCreate(false);
  }

  async function runOfflineWorker() {
    setPendingTick(true);
    const d = await fetchApi("/api/downloads/worker/offline-tick", { method: "POST" });
    if (d) {
      if (d.plan) setPlanItem(d.plan);
      toast.success(d.reason || "离线 Worker 已执行");
      await refresh();
    }
    setPendingTick(false);
  }

  async function runTransferWorker() {
    setPendingTick(true);
    const d = await fetchApi("/api/downloads/worker/transfer-tick", { method: "POST" });
    if (d) {
      if (d.plan) setPlanItem(d.plan);
      toast.success(d.reason || "传输 Worker 已执行");
      await refresh();
    }
    setPendingTick(false);
  }

  async function cancelTask(taskId: string) {
    setPendingAction(`cancel:${taskId}`);
    await fetchApi(`/api/downloads/${taskId}/cancel`, { method: "POST" });
    await refresh();
    setPendingAction(null);
  }

  async function retryTask(taskId: string) {
    setPendingAction(`retry:${taskId}`);
    await fetchApi(`/api/downloads/${taskId}/retry`, { method: "POST" });
    await refresh();
    setPendingAction(null);
  }

  async function deleteTask(taskId: string) {
    setPendingAction(`delete:${taskId}`);
    await fetchApi(`/api/downloads/${taskId}/delete`, { method: "POST" });
    await refresh();
    setPendingAction(null);
  }

  async function pullBackTask(taskId: string) {
    setPendingAction(`pullback:${taskId}`);
    const d = await fetchApi(`/api/downloads/${taskId}/pull-back`, { method: "POST" });
    if (d && d.created) {
      toast.success(d.message || "已创建传输任务，请查看传输列表");
    }
    await refresh();
    setPendingAction(null);
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Group justify="space-between" mb="lg">
        <Box>
          <Text component="h1" size="20px" fw={700} mb={2}>下载任务</Text>
          <Text size="sm" c="ink.5">管理离线下载和本地传输任务。</Text>
        </Box>
        <Group gap="sm">
          <AppButton leftSection={<Play size={15} />} loading={pendingTick} onClick={activeTab === "offline" ? runOfflineWorker : runTransferWorker}>
            运行 Worker
          </AppButton>
        </Group>
      </Group>

      <Tabs value={activeTab ?? "offline"} onChange={(v) => setActiveTab(v as string)}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="offline" leftSection={<CloudDownload size={14} />}>
            离线下载 {offlineTasks.length > 0 ? `(${offlineTasks.length})` : ""}
          </Tabs.Tab>
          <Tabs.Tab value="transfer" leftSection={<ArrowDownToLine size={14} />}>
            传输列表 {transferTasks.length > 0 ? `(${transferTasks.length})` : ""}
          </Tabs.Tab>
        </Tabs.List>

        {/* ===== 离线下载 Tab ===== */}
        <Tabs.Panel value="offline">
          {/* Stats */}
          <Group gap="lg" mb="lg" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10 }}>
            <MiniStat label="排队" value={String(offlineTasks.filter((t) => t.status === "queued").length)} />
            <MiniStat label="处理中" value={String(offlineTasks.filter((t) => t.status === "submitted" || t.status === "running").length)} />
            <MiniStat label="已完成" value={String(offlineTasks.filter((t) => t.status === "completed").length)} />
            <MiniStat label="失败" value={String(offlineTasks.filter((t) => t.status === "failed").length)} />
            <MiniStat label="资源" value={String(resourceItems.length)} />
          </Group>

          {/* Create Task */}
          <Paper p="md" mb="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10 }}>
            <Text size="sm" fw={700} mb="sm">创建离线下载任务</Text>
            <Group align="flex-end" gap="sm" wrap="wrap">
              <Select
                label="资源"
                placeholder="选择要下载的资源"
                data={resourceOpts}
                value={selectedId}
                onChange={(v) => { setSelectedId(v); if (v) { const r = resourceItems.find((x) => x.id === v); if (r) setProvider(r.defaultProvider); } }}
                searchable
                nothingFoundMessage="无匹配"
                disabled={resourceOpts.length === 0}
                style={{ flex: "1 1 360px", minWidth: 280 }}
                size="xs"
              />
              {providerOpts.length > 1 && (
                <Select
                  label="Provider"
                  data={providerOpts}
                  value={provider}
                  onChange={(v) => v && setProvider(v as DownloadProvider)}
                  style={{ width: 140 }}
                  size="xs"
                />
              )}
              <AppInput
                label="目标目录"
                placeholder="留空使用默认"
                value={targetDir}
                onChange={(e) => setTargetDir(e.currentTarget.value)}
                size="xs"
                style={{ flex: "1 1 240px", minWidth: 180 }}
              />
              <AppButton leftSection={<Plus size={15} />} loading={pendingCreate} disabled={!selected} onClick={createTask} size="xs">
                创建任务
              </AppButton>
            </Group>
          </Paper>

          {/* Offline Task List */}
          <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10 }}>
            <Text size="sm" fw={700} mb="sm">离线任务 {offlineTasks.length > 0 ? `(${offlineTasks.length})` : ""}</Text>
            {offlineTasks.length > 0 ? (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>漫画</Table.Th>
                    <Table.Th w={90}>Provider</Table.Th>
                    <Table.Th w={80}>类型</Table.Th>
                    <Table.Th w={100}>远程状态</Table.Th>
                    <Table.Th w={160}>操作</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {offlineTasks.map((task) => (
                    <Table.Tr key={task.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{task.comicTitle}</Text>
                        <Text size="xs" c="ink.5">{task.resourceLabel}</Text>
                      </Table.Td>
                      <Table.Td>{PROVIDER_LABELS[task.provider] || task.provider}</Table.Td>
                      <Table.Td>{TYPE_LABELS[task.resourceType ?? ""] || task.resourceType}</Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <StatusBadge status={task.status} />
                          {task.status === "failed" && task.errorMessage && !task.errorMessage.startsWith("{") && (
                            <Text size="10px" c="red" style={{ maxWidth: 200, wordBreak: "break-all", lineHeight: 1.3 }}>
                              {task.errorMessage}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          {(task.status === "completed") && (
                            <Tooltip label="拉回本地" withArrow>
                              <AppButton size="xs" variant="outline"
                                leftSection={<ArrowDownToLine size={12} />}
                                loading={pendingAction === `pullback:${task.id}`}
                                onClick={() => pullBackTask(task.id)}
                              >拉回</AppButton>
                            </Tooltip>
                          )}
                          {(task.status === "queued" || task.status === "submitted" || task.status === "running") && (
                            <Tooltip label="取消任务" withArrow>
                              <AppButton size="xs" variant="outline" color="red"
                                loading={pendingAction === `cancel:${task.id}`}
                                onClick={() => cancelTask(task.id)}
                              >取消</AppButton>
                            </Tooltip>
                          )}
                          {(task.status === "failed" || task.status === "canceled") && (
                            <Tooltip label="重新排队" withArrow>
                              <AppButton size="xs" variant="outline"
                                leftSection={<RotateCcw size={12} />}
                                loading={pendingAction === `retry:${task.id}`}
                                onClick={() => retryTask(task.id)}
                              >重试</AppButton>
                            </Tooltip>
                          )}
                          <Tooltip label="删除任务" withArrow>
                            <AppButton size="xs" variant="outline" color="red"
                              leftSection={<Trash2 size={12} />}
                              loading={pendingAction === `delete:${task.id}`}
                              onClick={() => deleteTask(task.id)}
                            >删除</AppButton>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text size="sm" c="ink.5" py="md" ta="center">暂无离线下载任务</Text>
            )}
          </Paper>
        </Tabs.Panel>

        {/* ===== 传输列表 Tab ===== */}
        <Tabs.Panel value="transfer">
          {/* Stats */}
          <Group gap="lg" mb="lg" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10 }}>
            <MiniStat label="排队" value={String(transferTasks.filter((t) => t.status === "queued").length)} />
            <MiniStat label="下载中" value={String(transferTasks.filter((t) => t.status === "downloading" || t.status === "running").length)} />
            <MiniStat label="已完成" value={String(transferTasks.filter((t) => t.status === "completed").length)} />
            <MiniStat label="失败" value={String(transferTasks.filter((t) => t.status === "failed").length)} />
          </Group>

          {/* Transfer Task List */}
          <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10 }}>
            <Text size="sm" fw={700} mb="sm">传输任务 {transferTasks.length > 0 ? `(${transferTasks.length})` : ""}</Text>
            {transferTasks.length > 0 ? (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>漫画</Table.Th>
                    <Table.Th w={100}>来源</Table.Th>
                    <Table.Th w={90}>Provider</Table.Th>
                    <Table.Th w={100}>状态</Table.Th>
                    <Table.Th w={140}>操作</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {transferTasks.map((task) => (
                    <Table.Tr key={task.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{task.comicTitle}</Text>
                        <Text size="xs" c="ink.5">{task.resourceLabel}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{task.offlineTaskId ? "离线任务" : "直接下载"}</Text>
                      </Table.Td>
                      <Table.Td>{PROVIDER_LABELS[task.provider] || task.provider}</Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <StatusBadge status={task.status} />
                          {task.status === "failed" && task.errorMessage && !task.errorMessage.startsWith("{") && (
                            <Text size="10px" c="red" style={{ maxWidth: 200, wordBreak: "break-all", lineHeight: 1.3 }}>
                              {task.errorMessage}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          {(task.status === "queued" || task.status === "downloading" || task.status === "running") && (
                            <Tooltip label="取消任务" withArrow>
                              <AppButton size="xs" variant="outline" color="red"
                                loading={pendingAction === `cancel:${task.id}`}
                                onClick={() => cancelTask(task.id)}
                              >取消</AppButton>
                            </Tooltip>
                          )}
                          {(task.status === "failed" || task.status === "canceled") && (
                            <Tooltip label="重新排队" withArrow>
                              <AppButton size="xs" variant="outline"
                                leftSection={<RotateCcw size={12} />}
                                loading={pendingAction === `retry:${task.id}`}
                                onClick={() => retryTask(task.id)}
                              >重试</AppButton>
                            </Tooltip>
                          )}
                          <Tooltip label="删除任务" withArrow>
                            <AppButton size="xs" variant="outline" color="red"
                              leftSection={<Trash2 size={12} />}
                              loading={pendingAction === `delete:${task.id}`}
                              onClick={() => deleteTask(task.id)}
                            >删除</AppButton>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text size="sm" c="ink.5" py="md" ta="center">暂无传输任务</Text>
            )}
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {/* Worker status */}
      <Paper p="md" mt="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10 }}>
        <Group justify="space-between" align="center">
          <Box>
            <Text size="sm" fw={700}>Worker 状态</Text>
            <Text size="xs" c="ink.5">{planItem.reason}</Text>
          </Box>
          <StatusBadge status={planItem.status === "idle" ? "completed" : planItem.status === "ready" ? "queued" : "failed"} />
        </Group>
      </Paper>
    </Box>
  );
}
