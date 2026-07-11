"use client";

import { Badge, Box, Group, Paper, Select, Stack, Table, Text, Tooltip } from "@mantine/core";
import { CloudDownload, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { AppButton, AppInput } from "@/components/ui/app-components";
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
  running: ["下载中", "blue"],
  completed: ["已完成", "green"],
  failed: ["失败", "red"],
  canceled: ["已取消", "gray"],
  cancel_requested: ["取消中", "yellow"],
};

type ApiData = {
  resources?: DownloadableResourceRecord[];
  tasks?: DownloadTaskRecord[];
  plan?: DownloadWorkerTickResult["plan"];
  reason?: string;
  error?: string;
  created?: boolean;
  task?: DownloadTaskRecord;
};

export function DownloadsPanel({
  dispatchPlan,
  resources,
  tasks,
}: {
  dispatchPlan: DownloadDispatchPlan;
  resources: DownloadableResourceRecord[];
  tasks: DownloadTaskRecord[];
}) {
  const [resourceItems, setResourceItems] = useState(resources);
  const [taskItems, setTaskItems] = useState(tasks);
  const [planItem, setPlanItem] = useState(dispatchPlan);
  const [selectedId, setSelectedId] = useAdminTabState<string | null>("resourceId", resources[0]?.id ?? null);
  const [provider, setProvider] = useAdminTabState<DownloadProvider>("provider", resources[0]?.defaultProvider ?? "openlist");
  const [targetDir, setTargetDir] = useAdminTabState("targetDir", "");
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingTick, setPendingTick] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: "success" | "error" } | null>(null);

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

  // Auto-run worker every 30 seconds
  useEffect(() => {
    const run = async () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      try {
        const res = await fetch("/api/downloads/worker/tick", { method: "POST" });
        const d = await res.json() as ApiData;
        if (d.plan) setPlanItem(d.plan);
        await refresh();
      } catch { /* ignore */ }
      tickingRef.current = false;
    };
    run(); // immediate first run
    const id = setInterval(run, 30000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showMsg(text: string, tone: "success" | "error") { setMsg({ text, tone }); setTimeout(() => setMsg(null), 4000); }

  async function fetchApi(path: string, opts: RequestInit = {}): Promise<ApiData | null> {
    try {
      const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
      const d = await res.json() as ApiData;
      if (!res.ok) throw new Error(d.error || "请求失败");
      return d;
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "请求失败", "error");
      return null;
    }
  }

  async function createTask() {
    if (!selected) return;
    setPendingCreate(true);
    const d = await fetchApi("/api/downloads", {
      method: "POST",
      body: JSON.stringify({ comicResourceId: selected.id, provider, targetDirectory: targetDir || null }),
    });
    if (d) {
      if (d.created) showMsg("任务已创建", "success");
      else showMsg("已有相同任务，未重复创建", "success");
      await refresh();
    }
    setPendingCreate(false);
  }

  async function runWorker() {
    setPendingTick(true);
    const d = await fetchApi("/api/downloads/worker/tick", { method: "POST" });
    if (d) {
      if (d.plan) setPlanItem(d.plan);
      showMsg(d.reason || "Worker 已执行", d.plan?.status === "idle" ? "success" : "success");
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

  async function refresh() {
    const d = await fetchApi("/api/downloads");
    if (d) {
      if (d.resources) setResourceItems(d.resources);
      if (d.tasks) setTaskItems(d.tasks);
      if (d.plan) setPlanItem(d.plan);
      if (d.resources && !d.resources.find((r) => r.id === selectedId)) {
        setSelectedId(d.resources[0]?.id ?? null);
      }
    }
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      {msg && (
        <Box style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999, padding: "10px 18px", borderRadius: 10,
          background: msg.tone === "success" ? "#087f5b" : "#d93a4e", color: "#fff",
          fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.18)", maxWidth: 400,
        }}>{msg.text}</Box>
      )}

      <Group justify="space-between" mb="lg">
        <Box>
          <Text component="h1" size="20px" fw={700} mb={2}>下载任务</Text>
          <Text size="sm" c="ink.5">创建下载任务并推送到 OpenList 离线下载。</Text>
        </Box>
        <Group gap="sm">
          <AppButton leftSection={<Play size={15} />} loading={pendingTick} onClick={runWorker}>
            运行 Worker
          </AppButton>
        </Group>
      </Group>

      {/* Stats */}
      <Group gap="lg" mb="lg" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10 }}>
        <MiniStat label="资源" value={String(resourceItems.length)} />
        <MiniStat label="排队中" value={String(taskItems.filter((t) => t.status === "queued").length)} />
        <MiniStat label="已完成" value={String(taskItems.filter((t) => t.status === "completed").length)} />
        <MiniStat label="失败" value={String(taskItems.filter((t) => t.status === "failed").length)} />
        <MiniStat label="Worker 状态" value={planItem.status === "idle" ? "空闲" : planItem.status === "ready" ? "就绪" : "阻塞"} />
      </Group>

      {/* Create Task */}
      <Paper p="md" mb="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10 }}>
        <Text size="sm" fw={700} mb="sm">创建下载任务</Text>
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

      {/* Task List */}
      <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10 }}>
        <Text size="sm" fw={700} mb="sm">任务列表 {taskItems.length > 0 ? `(${taskItems.length})` : ""}</Text>
        {taskItems.length > 0 ? (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>漫画</Table.Th>
                <Table.Th w={90}>Provider</Table.Th>
                <Table.Th w={80}>类型</Table.Th>
                <Table.Th w={90}>状态</Table.Th>
                <Table.Th w={120}>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {taskItems.map((task) => (
                <Table.Tr key={task.id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>{task.comicTitle}</Text>
                    <Text size="xs" c="ink.5">{task.resourceLabel}</Text>
                  </Table.Td>
                  <Table.Td>{PROVIDER_LABELS[task.provider] || task.provider}</Table.Td>
                  <Table.Td>{TYPE_LABELS[task.resourceType ?? ""] || task.resourceType}</Table.Td>
                  <Table.Td>
                    <StatusBadge status={task.status} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      {(task.status === "queued" || task.status === "running") && (
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
          <Text size="sm" c="ink.5" py="md" ta="center">暂无下载任务</Text>
        )}
      </Paper>

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
