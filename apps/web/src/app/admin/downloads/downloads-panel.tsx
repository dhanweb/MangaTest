"use client";

import { ActionIcon, Box, Group, Stack, Table, Text, Tooltip } from "@mantine/core";
import { CheckCircle2, CloudDownload, Link2, Plus, RotateCcw, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { AppButton, AppInput, AppSelect } from "@/components/ui/app-components";
import type {
  CloudScanSessionRecord,
  CloudScanStatus,
  ComicResourceType,
  DownloadableResourceRecord,
  DownloadDispatchPlan,
  DownloadPreparationStatus,
  DownloadProvider,
  DownloadTaskEventOperation,
  DownloadTaskEventRecord,
  DownloadTaskRecord,
  DownloadTaskStatus,
  DownloadTransferStatus,
  DownloadWorkerTickResult,
} from "@/modules/downloads";

const PROVIDER_LABELS: Record<DownloadProvider, string> = {
  "aria2": "aria2",
  "builtin-http": "内置 HTTP",
  "openlist": "OpenList",
};

const RESOURCE_TYPE_LABELS: Record<ComicResourceType, string> = {
  http: "HTTP",
  magnet: "磁链",
  openlist: "OpenList",
  torrent: "Torrent",
};

const TASK_STATUS_CONFIG: Record<DownloadTaskStatus, { label: string; bg: string; color: string }> = {
  cancel_requested: { label: "取消中", bg: "#fff4d6", color: "#b86b00" },
  canceled: { label: "已取消", bg: "#edf2f7", color: "#53606c" },
  completed: { label: "已完成", bg: "#e4f9ed", color: "#00894a" },
  failed: { label: "失败", bg: "#ffe1e1", color: "#d93a4e" },
  queued: { label: "排队中", bg: "var(--mantine-color-pink-0)", color: "var(--mantine-color-pink-6)" },
  running: { label: "运行中", bg: "#e7f0ff", color: "#2563eb" },
};

const EVENT_OPERATION_CONFIG: Record<DownloadTaskEventOperation, { label: string; bg: string; color: string }> = {
  download_task_cancel: { label: "取消", bg: "#ffe1e1", color: "#d93a4e" },
  download_task_create: { label: "创建", bg: "var(--mantine-color-pink-0)", color: "var(--mantine-color-pink-6)" },
  download_task_retry: { label: "重试", bg: "#e7f0ff", color: "#2563eb" },
};

const DISPATCH_STATUS_CONFIG: Record<DownloadDispatchPlan["status"], { label: string; bg: string; color: string }> = {
  blocked: { label: "阻塞", bg: "#fff4d6", color: "#b86b00" },
  idle: { label: "空闲", bg: "#edf2f7", color: "#53606c" },
  ready: { label: "就绪", bg: "#e4f9ed", color: "#00894a" },
};

const PREPARATION_STATUS_CONFIG: Record<DownloadPreparationStatus, { label: string; bg: string; color: string }> = {
  blocked: { label: "未就绪", bg: "#fff4d6", color: "#b86b00" },
  ready: { label: "已准备", bg: "#e4f9ed", color: "#00894a" },
};

const TRANSFER_STATUS_CONFIG: Record<DownloadTransferStatus, { label: string; bg: string; color: string }> = {
  completed: { label: "临时完成", bg: "#e4f9ed", color: "#00894a" },
  failed: { label: "临时失败", bg: "#ffe1e1", color: "#d93a4e" },
  running: { label: "下载中", bg: "#e7f0ff", color: "#2563eb" },
};

const CLOUD_SCAN_STATUS_CONFIG: Record<CloudScanStatus, { label: string; bg: string; color: string }> = {
  completed: { label: "已完成", bg: "#e4f9ed", color: "#00894a" },
  failed: { label: "失败", bg: "#ffe1e1", color: "#d93a4e" },
  running: { label: "扫描中", bg: "#e7f0ff", color: "#2563eb" },
};

type DownloadsApiResponse = {
  cloudScans?: CloudScanSessionRecord[];
  createdCount?: number;
  executed?: boolean;
  resources?: DownloadableResourceRecord[];
  dispatchPlan?: DownloadDispatchPlan;
  events?: DownloadTaskEventRecord[];
  plan?: DownloadWorkerTickResult["plan"];
  reason?: string;
  scan?: CloudScanSessionRecord;
  skippedCount?: number;
  tasks?: DownloadTaskRecord[];
  task?: DownloadTaskRecord;
  transfer?: DownloadWorkerTickResult["transfer"];
  created?: boolean;
  error?: string;
};

export function DownloadsPanel({
  cloudScans,
  dispatchPlan,
  events,
  resources,
  tasks,
}: {
  cloudScans: CloudScanSessionRecord[];
  dispatchPlan: DownloadDispatchPlan;
  events: DownloadTaskEventRecord[];
  resources: DownloadableResourceRecord[];
  tasks: DownloadTaskRecord[];
}) {
  const [cloudScanItems, setCloudScanItems] = useState(cloudScans);
  const [eventItems, setEventItems] = useState(events);
  const [dispatchPlanItem, setDispatchPlanItem] = useState(dispatchPlan);
  const [resourceItems, setResourceItems] = useState(resources);
  const [taskItems, setTaskItems] = useState(tasks);
  const [search, setSearch] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(() => resources[0]?.id ?? null);
  const [provider, setProvider] = useState<DownloadProvider>(() => resources[0]?.defaultProvider ?? "aria2");
  const [targetDirectory, setTargetDirectory] = useState("");
  const [pendingCloudScanResourceId, setPendingCloudScanResourceId] = useState<string | null>(null);
  const [pendingCloudScanImportId, setPendingCloudScanImportId] = useState<string | null>(null);
  const [pendingResourceId, setPendingResourceId] = useState<string | null>(null);
  const [pendingTaskAction, setPendingTaskAction] = useState<string | null>(null);
  const [pendingWorkerTick, setPendingWorkerTick] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedResource = useMemo(() => resourceItems.find((resource) => resource.id === selectedResourceId) ?? null, [resourceItems, selectedResourceId]);
  const providerOptions = useMemo(
    () =>
      (selectedResource?.compatibleProviders ?? [])
        .map((value) => ({ value, label: PROVIDER_LABELS[value] }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN")),
    [selectedResource],
  );
  const resourceOptions = useMemo(
    () =>
      resourceItems.map((resource) => ({
        value: resource.id,
        label: `${resource.comicTitle} · ${RESOURCE_TYPE_LABELS[resource.resourceType]} · ${resource.displayLabel}`,
      })),
    [resourceItems],
  );
  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return resourceItems;
    }

    return resourceItems.filter((resource) =>
      [
        resource.comicTitle,
        resource.displayLabel,
        resource.redactedResource,
        resource.sourceSite ?? "",
        RESOURCE_TYPE_LABELS[resource.resourceType],
        PROVIDER_LABELS[resource.defaultProvider],
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [resourceItems, search]);
  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return taskItems;
    }

    return taskItems.filter((task) =>
      [
        task.comicTitle,
        task.resourceLabel,
        task.redactedResource,
        task.sourceSite ?? "",
        PROVIDER_LABELS[task.provider],
        TASK_STATUS_CONFIG[task.status].label,
        task.preparation ? PREPARATION_STATUS_CONFIG[task.preparation.status].label : "",
        task.preparation?.remoteName ?? "",
        task.transfer ? TRANSFER_STATUS_CONFIG[task.transfer.status].label : "",
        task.transfer?.fileName ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [taskItems, search]);
  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return eventItems;
    }

    return eventItems.filter((event) =>
      [
        EVENT_OPERATION_CONFIG[event.operation].label,
        event.summary,
        event.comicTitle ?? "",
        event.resourceLabel ?? "",
        event.redactedResource ?? "",
        event.provider ? PROVIDER_LABELS[event.provider] : "",
        event.status ? TASK_STATUS_CONFIG[event.status].label : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [eventItems, search]);
  const filteredCloudScans = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return cloudScanItems;
    }

    return cloudScanItems.filter((scan) =>
      [
        scan.comicTitle ?? "",
        scan.resourceLabel ?? "",
        scan.redactedResource ?? "",
        scan.rootPath,
        CLOUD_SCAN_STATUS_CONFIG[scan.status].label,
        scan.errorSummary ?? "",
        ...scan.previewEntries.map((entry) => entry.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [cloudScanItems, search]);

  const activeTaskCount = taskItems.filter((task) => task.status === "queued" || task.status === "running" || task.status === "cancel_requested").length;
  const failedTaskCount = taskItems.filter((task) => task.status === "failed").length;
  const preparedTaskCount = taskItems.filter((task) => task.preparation?.status === "ready").length;
  const completedTransferCount = taskItems.filter((task) => task.transfer?.status === "completed").length;
  const canCreateSelectedTask = Boolean(selectedResource && selectedResource.activeTaskCount === 0 && !pendingResourceId);

  function changeSelectedResource(resourceId: string | null) {
    const nextResource = resourceItems.find((resource) => resource.id === resourceId) ?? null;

    setSelectedResourceId(resourceId);
    setProvider(nextResource?.defaultProvider ?? "aria2");
    setMessage("");
    setError("");
  }

  async function createTaskForResource(resource: DownloadableResourceRecord | null, providerOverride?: DownloadProvider) {
    if (!resource) {
      setError("请选择要创建任务的资源。");
      return;
    }

    const nextProvider = providerOverride ?? (resource.id === selectedResourceId ? provider : resource.defaultProvider);

    setPendingResourceId(resource.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/downloads", {
        method: "POST",
        body: JSON.stringify({
          comicResourceId: resource.id,
          provider: nextProvider,
          targetDirectory: resource.id === selectedResourceId ? targetDirectory : "",
        }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as DownloadsApiResponse;

      if (!response.ok || !payload.task) {
        throw new Error(payload.error ?? "创建下载任务失败。");
      }

      const savedTask = payload.task;

      setTaskItems((current) => upsertTask(current, savedTask));
      setMessage(payload.created ? "已创建下载任务。" : "已有活动任务，已复用现有记录。");
      await refreshDownloads(resource.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建下载任务失败。");
    } finally {
      setPendingResourceId(null);
    }
  }

  async function updateTaskStatus(task: DownloadTaskRecord, action: "cancel" | "retry") {
    const actionKey = `${task.id}:${action}`;

    setPendingTaskAction(actionKey);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/downloads/${encodeURIComponent(task.id)}/${action}`, { method: "POST" });
      const payload = (await response.json()) as DownloadsApiResponse;

      if (!response.ok || !payload.task) {
        throw new Error(payload.error ?? (action === "cancel" ? "取消下载任务失败。" : "重试下载任务失败。"));
      }

      const updatedTask = payload.task;

      setTaskItems((current) => upsertTask(current, updatedTask));
      setMessage(action === "cancel" ? "已更新下载任务取消状态。" : "已重新加入下载队列。");
      await refreshDownloads(updatedTask.comicResourceId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : action === "cancel" ? "取消下载任务失败。" : "重试下载任务失败。");
    } finally {
      setPendingTaskAction(null);
    }
  }

  async function runWorkerPreflight() {
    setPendingWorkerTick(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/downloads/worker/tick", { method: "POST" });
      const payload = (await response.json()) as DownloadsApiResponse;

      if (!response.ok || !payload.plan) {
        throw new Error(payload.error ?? "下载 worker 预检失败。");
      }

      setDispatchPlanItem(payload.plan);
      setMessage(payload.reason ?? "已完成下载 worker 预检。");
      await refreshDownloads(payload.plan.task?.comicResourceId ?? selectedResourceId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "下载 worker 预检失败。");
    } finally {
      setPendingWorkerTick(false);
    }
  }

  async function scanOpenListResource(resource: DownloadableResourceRecord) {
    if (resource.resourceType !== "openlist") {
      setError("只有 OpenList 资源可以进行云端目录扫描。");
      return;
    }

    setPendingCloudScanResourceId(resource.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/downloads/openlist/cloud-scans", {
        body: JSON.stringify({ comicResourceId: resource.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as DownloadsApiResponse;

      if (!response.ok || !payload.scan) {
        throw new Error(payload.error ?? "OpenList 云端目录扫描失败。");
      }

      setCloudScanItems(payload.cloudScans ?? [payload.scan, ...cloudScanItems]);
      setMessage(payload.scan.status === "completed" ? "已完成 OpenList 云端目录扫描。" : "已记录 OpenList 云端扫描失败结果。");
      await refreshDownloads(resource.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "OpenList 云端目录扫描失败。");
    } finally {
      setPendingCloudScanResourceId(null);
    }
  }

  async function importCloudScanResources(scan: CloudScanSessionRecord) {
    setPendingCloudScanImportId(scan.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/downloads/openlist/cloud-scans/${encodeURIComponent(scan.id)}/resources`, { method: "POST" });
      const payload = (await response.json()) as DownloadsApiResponse;

      if (!response.ok || payload.createdCount == null || payload.skippedCount == null) {
        throw new Error(payload.error ?? "导入 OpenList 云端扫描资源失败。");
      }

      setCloudScanItems(payload.cloudScans ?? cloudScanItems);
      if (payload.resources) {
        setResourceItems(payload.resources);
      }
      setMessage(`已导入 ${payload.createdCount} 个资源，跳过 ${payload.skippedCount} 个已有资源。`);
      await refreshDownloads(scan.comicResourceId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入 OpenList 云端扫描资源失败。");
    } finally {
      setPendingCloudScanImportId(null);
    }
  }

  async function refreshDownloads(preferredResourceId: string | null) {
    const response = await fetch("/api/downloads");
    const payload = (await response.json()) as DownloadsApiResponse;

    if (!response.ok || !payload.resources || !payload.tasks) {
      return;
    }

    setEventItems(payload.events ?? []);
    setCloudScanItems(payload.cloudScans ?? []);
    if (payload.dispatchPlan) {
      setDispatchPlanItem(payload.dispatchPlan);
    }
    setResourceItems(payload.resources);
    setTaskItems(payload.tasks);

    const nextSelected = payload.resources.find((resource) => resource.id === preferredResourceId) ?? payload.resources[0] ?? null;
    setSelectedResourceId(nextSelected?.id ?? null);
    setProvider(nextSelected?.defaultProvider ?? "aria2");
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
        <CloudDownload size={22} style={{ flexShrink: 0, marginTop: 1 }} />
        <Box style={{ flex: 1 }}>
          <Text component="h1" size="20px" fw={700} mb={4}>
            下载任务
          </Text>
          <Text size="sm" c="ink.5">
            管理从插件 metadata 资源生成的下载队列。
          </Text>
        </Box>
      </Box>

      <Group gap="xl" mb="lg" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10 }}>
        <Stat label="可下载资源" value={resourceItems.length} color="var(--mantine-color-pink-6)" />
        <Stat label="活动任务" value={activeTaskCount} color="#2563eb" />
        <Stat label="已准备链接" value={preparedTaskCount} color="#00894a" />
        <Stat label="临时文件" value={completedTransferCount} color="#4f46e5" />
        <Stat label="失败任务" value={failedTaskCount} color="#d93a4e" />
        <Stat label="云端扫描" value={cloudScanItems.length} color="#00894a" />
        <Stat label="任务总数" value={taskItems.length} color="#4f46e5" />
      </Group>

      <Stack gap="md">
        <DispatchPlanPanel dispatchPlan={dispatchPlanItem} pendingWorkerTick={pendingWorkerTick} onRunWorkerPreflight={runWorkerPreflight} />

        <Box style={{ border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, padding: 16 }}>
          <Group align="flex-end" gap="sm" wrap="wrap">
            <AppSelect
              label="资源"
              placeholder="暂无可下载资源"
              data={resourceOptions}
              value={selectedResourceId}
              onChange={changeSelectedResource}
              searchable
              nothingFoundMessage="无匹配资源"
              disabled={resourceOptions.length === 0}
              styles={{ root: { flex: "1 1 360px", minWidth: 280 } }}
            />
            <AppSelect
              label="Provider"
              data={providerOptions}
              value={provider}
              onChange={(value) => setProvider((value as DownloadProvider | null) ?? selectedResource?.defaultProvider ?? "aria2")}
              disabled={!selectedResource}
              styles={{ root: { width: 160 } }}
            />
            <AppInput
              label="目标目录"
              placeholder="留空使用默认目录"
              value={targetDirectory}
              onChange={(event) => setTargetDirectory(event.currentTarget.value)}
              styles={{ root: { flex: "1 1 260px", minWidth: 220 } }}
            />
            <AppButton
              leftSection={<Plus size={16} />}
              loading={selectedResource ? pendingResourceId === selectedResource.id : false}
              disabled={!canCreateSelectedTask}
              onClick={() => createTaskForResource(selectedResource)}
            >
              创建任务
            </AppButton>
          </Group>
          {(message || error) && (
            <Text size="sm" c={error ? "red.7" : "green.7"} mt="sm">
              {error || message}
            </Text>
          )}
        </Box>

        <Group justify="space-between" align="center" wrap="wrap">
          <Box
            component="label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 36,
              padding: "0 12px",
              border: "1px solid var(--mantine-color-pink-2)",
              borderRadius: 10,
              background: "white",
              maxWidth: 360,
              flex: 1,
            }}
          >
            <Search size={15} style={{ color: "var(--mantine-color-ink-5)", flexShrink: 0 }} />
            <Box
              component="input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="搜索资源、漫画或任务..."
              style={{
                width: "100%",
                minWidth: 0,
                border: 0,
                outline: 0,
                background: "transparent",
                color: "var(--mantine-color-ink-7)",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
          </Box>
        </Group>

        <Box>
          <Text component="h2" size="lg" fw={900} c="ink.8" mb="sm">
            最近活动
          </Text>
          <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
                  <Table.Th fw={900} c="#8d5a6e" w={92}>
                    事件
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e">
                    摘要
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e">
                    资源
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e" w={136}>
                    时间
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredEvents.map((event) => (
                  <Table.Tr key={event.id}>
                    <Table.Td>
                      <EventOperationBadge operation={event.operation} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={700}>
                        {event.summary}
                      </Text>
                      <Text size="xs" c="ink.5">
                        {event.provider ? PROVIDER_LABELS[event.provider] : "未知 provider"}
                        {event.status ? ` · ${TASK_STATUS_CONFIG[event.status].label}` : ""}
                        {event.retryCount && event.retryCount > 0 ? ` · 重试 ${event.retryCount} 次` : ""}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {event.comicTitle ?? "未知漫画"}
                      </Text>
                      <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                        {event.resourceLabel ?? "资源"} · {event.redactedResource ?? "资源已脱敏"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="ink.5">
                        {formatDate(event.createdAt)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {filteredEvents.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text size="sm" c="ink.5" ta="center" py="md">
                        暂无下载活动
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Box>
        </Box>

        <Box>
          <Text component="h2" size="lg" fw={900} c="ink.8" mb="sm">
            可下载资源
          </Text>
          <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
                  <Table.Th fw={900} c="#8d5a6e" w={92}>
                    类型
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e">
                    漫画
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e">
                    资源
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e" w={116}>
                    Provider
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e" w={104}>
                    任务
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e" w={72}>
                    操作
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredResources.map((resource) => (
                  <Table.Tr key={resource.id}>
                    <Table.Td>
                      <ResourceTypeBadge type={resource.resourceType} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={700}>
                        {resource.comicTitle}
                      </Text>
                      <Text size="xs" c="ink.5">
                        {statusLabel(resource.comicStatus)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {resource.displayLabel}
                      </Text>
                      <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                        {resource.redactedResource}
                      </Text>
                      {resource.sourceSite && (
                        <Text size="xs" c="ink.5" mt={3}>
                          {resource.sourceSite}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{PROVIDER_LABELS[resource.defaultProvider]}</Text>
                    </Table.Td>
                    <Table.Td>
                      {resource.activeTaskCount > 0 ? (
                        <StatusBadge status={resource.latestTaskStatus ?? "queued"} />
                      ) : (
                        <Text size="sm" c="ink.5">
                          未排队
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                      <Tooltip label={resource.activeTaskCount > 0 ? "已有活动任务" : "创建下载任务"} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="pink"
                          size="md"
                          disabled={resource.activeTaskCount > 0}
                          loading={pendingResourceId === resource.id}
                          onClick={() => createTaskForResource(resource, resource.defaultProvider)}
                          aria-label={`创建 ${resource.comicTitle} 的下载任务`}
                        >
                          {resource.activeTaskCount > 0 ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={resource.resourceType === "openlist" ? "扫描云端目录" : "仅 OpenList 资源可扫描"} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="blue"
                          size="md"
                          disabled={resource.resourceType !== "openlist"}
                          loading={pendingCloudScanResourceId === resource.id}
                          onClick={() => scanOpenListResource(resource)}
                          aria-label={`扫描 ${resource.comicTitle} 的 OpenList 云端目录`}
                        >
                          <Search size={15} />
                        </ActionIcon>
                      </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {filteredResources.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text size="sm" c="ink.5" ta="center" py="md">
                        没有找到匹配的资源
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Box>
        </Box>

        <CloudScanPanel scans={filteredCloudScans} pendingImportId={pendingCloudScanImportId} onImportResources={importCloudScanResources} />

        <Box>
          <Text component="h2" size="lg" fw={900} c="ink.8" mb="sm">
            任务列表
          </Text>
          <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
                  <Table.Th fw={900} c="#8d5a6e" w={96}>
                    状态
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e">
                    漫画
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e">
                    资源
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e" w={116}>
                    Provider
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e" w={132}>
                    准备
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e">
                    目标目录
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e" w={136}>
                    更新时间
                  </Table.Th>
                  <Table.Th fw={900} c="#8d5a6e" w={96}>
                    操作
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredTasks.map((task) => (
                  <Table.Tr key={task.id}>
                    <Table.Td>
                      <StatusBadge status={task.status} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={700}>
                        {task.comicTitle}
                      </Text>
                      {task.sourceSite && (
                        <Text size="xs" c="ink.5">
                          {task.sourceSite}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {task.resourceLabel}
                      </Text>
                      <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                        {task.redactedResource}
                      </Text>
                      {task.errorMessage && (
                        <Text size="xs" c="red.7" mt={3}>
                          {task.errorMessage}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{PROVIDER_LABELS[task.provider]}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        {task.preparation ? (
                          <Box>
                            <PreparationStatusBadge status={task.preparation.status} />
                            <Text size="xs" c="ink.5" mt={3}>
                              {task.preparation.remoteName ?? "未知文件"}
                              {task.preparation.sizeBytes != null ? ` · ${formatBytes(task.preparation.sizeBytes)}` : ""}
                            </Text>
                          </Box>
                        ) : (
                          <Text size="sm" c="ink.5">
                            未准备
                          </Text>
                        )}
                        {task.transfer && (
                          <Box>
                            <TransferStatusBadge status={task.transfer.status} />
                            <Text size="xs" c="ink.5" mt={3} style={{ overflowWrap: "anywhere" }}>
                              {task.transfer.fileName ?? "临时文件"}
                              {task.transfer.bytesWritten > 0 ? ` · ${formatBytes(task.transfer.bytesWritten)}` : ""}
                            </Text>
                          </Box>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                        {task.targetDirectory ?? "默认入库目录"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="ink.5">
                        {formatDate(task.updatedAt)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <TaskActions task={task} pendingTaskAction={pendingTaskAction} onUpdateTask={updateTaskStatus} />
                    </Table.Td>
                  </Table.Tr>
                ))}
                {filteredTasks.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Text size="sm" c="ink.5" ta="center" py="md">
                        还没有下载任务
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}

function TaskActions({
  onUpdateTask,
  pendingTaskAction,
  task,
}: {
  onUpdateTask: (task: DownloadTaskRecord, action: "cancel" | "retry") => void;
  pendingTaskAction: string | null;
  task: DownloadTaskRecord;
}) {
  const canCancel = task.status === "queued" || task.status === "running";
  const canRetry = task.status === "failed" || task.status === "canceled";

  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label={canCancel ? "取消任务" : "当前状态不能取消"} withArrow>
        <ActionIcon
          variant="subtle"
          color="red"
          size="md"
          disabled={!canCancel}
          loading={pendingTaskAction === `${task.id}:cancel`}
          onClick={() => onUpdateTask(task, "cancel")}
          aria-label={`取消 ${task.comicTitle} 的下载任务`}
        >
          <XCircle size={15} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={canRetry ? "重新排队" : "只有失败或已取消的任务可以重试"} withArrow>
        <ActionIcon
          variant="subtle"
          color="pink"
          size="md"
          disabled={!canRetry}
          loading={pendingTaskAction === `${task.id}:retry`}
          onClick={() => onUpdateTask(task, "retry")}
          aria-label={`重试 ${task.comicTitle} 的下载任务`}
        >
          <RotateCcw size={15} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function CloudScanPanel({
  onImportResources,
  pendingImportId,
  scans,
}: {
  onImportResources: (scan: CloudScanSessionRecord) => void;
  pendingImportId: string | null;
  scans: CloudScanSessionRecord[];
}) {
  return (
    <Box>
      <Text component="h2" size="lg" fw={900} c="ink.8" mb="sm">
        云端目录扫描
      </Text>
      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e" w={96}>
                状态
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e">
                漫画
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e">
                目录
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={156}>
                统计
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e">
                预览
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={136}>
                时间
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={88}>
                操作
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {scans.map((scan) => {
              const canImport = scan.status === "completed" && scan.importableFileCount > 0;

              return (
                <Table.Tr key={scan.id}>
                  <Table.Td>
                    <CloudScanStatusBadge status={scan.status} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={700}>
                      {scan.comicTitle ?? "未知漫画"}
                    </Text>
                    <Text size="xs" c="ink.5">
                      {scan.resourceLabel ?? "OpenList"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                      {scan.rootPath}
                    </Text>
                    {scan.errorSummary && (
                      <Text size="xs" c="red.7" mt={3}>
                        {scan.errorSummary}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="ink.5">
                      {scan.totalCount} 项 · {scan.fileCount} 文件 · {scan.directoryCount} 目录
                    </Text>
                    <Text size="xs" c="ink.5">
                      {scan.importableFileCount} 个可取直链
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                      {formatCloudScanPreview(scan.previewEntries)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="ink.5">
                      {formatDate(scan.finishedAt ?? scan.startedAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={canImport ? "导入为可下载资源" : "没有可导入文件"} withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="pink"
                        size="md"
                        disabled={!canImport}
                        loading={pendingImportId === scan.id}
                        onClick={() => onImportResources(scan)}
                        aria-label={`导入 ${scan.comicTitle ?? "未知漫画"} 的 OpenList 扫描资源`}
                      >
                        <Plus size={15} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {scans.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text size="sm" c="ink.5" ta="center" py="md">
                    暂无云端扫描记录
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  );
}

function DispatchPlanPanel({
  dispatchPlan,
  onRunWorkerPreflight,
  pendingWorkerTick,
}: {
  dispatchPlan: DownloadDispatchPlan;
  onRunWorkerPreflight: () => void;
  pendingWorkerTick: boolean;
}) {
  const task = dispatchPlan.task;
  const resource = dispatchPlan.resource;
  const preparation = task?.preparation ?? null;
  const transfer = task?.transfer ?? null;
  const readinessDetails = formatReadinessDetails(dispatchPlan.readiness?.details);

  return (
    <Box style={{ border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, padding: 16 }}>
      <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
        <Box style={{ minWidth: 0, flex: "1 1 320px" }}>
          <Text component="h2" size="lg" fw={900} c="ink.8" mb={4}>
            调度预检
          </Text>
          <Text size="sm" c="ink.6">
            {dispatchPlan.reason}
          </Text>
        </Box>
        <Group gap="sm" wrap="nowrap">
          <AppButton
            leftSection={<Link2 size={16} />}
            variant="outline"
            loading={pendingWorkerTick}
            disabled={!task}
            onClick={onRunWorkerPreflight}
          >
            运行 worker
          </AppButton>
          <DispatchStatusBadge status={dispatchPlan.status} />
        </Group>
      </Group>

      <Group gap="lg" mt="md" wrap="wrap">
        <CompactInfo label="Provider" value={dispatchPlan.adapterLabel ?? dispatchPlan.provider ?? "暂无"} />
        <CompactInfo label="下一任务" value={task ? task.comicTitle : "暂无排队任务"} />
        <CompactInfo label="资源" value={resource ? `${RESOURCE_TYPE_LABELS[resource.resourceType]} · ${resource.displayLabel}` : "暂无"} />
        <CompactInfo label="预检时间" value={formatDate(dispatchPlan.checkedAt)} />
      </Group>
      {preparation && (
        <Group gap="lg" mt="md" wrap="wrap">
          <CompactInfo label="准备状态" value={PREPARATION_STATUS_CONFIG[preparation.status].label} />
          <CompactInfo label="远端文件" value={preparation.remoteName ?? "未知文件"} />
          <CompactInfo label="直链" value={preparation.rawUrlAvailable ? "已确认" : "未确认"} />
          <CompactInfo label="准备时间" value={formatDate(preparation.preparedAt)} />
        </Group>
      )}
      {transfer && (
        <Group gap="lg" mt="md" wrap="wrap">
          <CompactInfo label="临时下载" value={TRANSFER_STATUS_CONFIG[transfer.status].label} />
          <CompactInfo label="临时文件" value={transfer.fileName ?? "暂无"} />
          <CompactInfo label="已写入" value={formatBytes(transfer.bytesWritten)} />
          <CompactInfo label="完成时间" value={transfer.finishedAt ? formatDate(transfer.finishedAt) : "进行中"} />
        </Group>
      )}
      {resource && (
        <Text size="xs" c="ink.5" mt="sm" style={{ overflowWrap: "anywhere" }}>
          {resource.redactedResource}
        </Text>
      )}
      {readinessDetails.length > 0 && (
        <Group gap="lg" mt="md" wrap="wrap">
          {readinessDetails.map((detail) => (
            <CompactInfo key={detail.label} label={detail.label} value={detail.value} />
          ))}
        </Group>
      )}
    </Box>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <Box style={{ minWidth: 140, maxWidth: 320 }}>
      <Text size="xs" c="ink.4" fw={700}>
        {label}
      </Text>
      <Text size="sm" fw={800} c="ink.8" style={{ overflowWrap: "anywhere" }}>
        {value}
      </Text>
    </Box>
  );
}

function upsertTask(items: DownloadTaskRecord[], task: DownloadTaskRecord) {
  const existingIndex = items.findIndex((item) => item.id === task.id);

  if (existingIndex === -1) {
    return [task, ...items];
  }

  return items.map((item) => (item.id === task.id ? task : item));
}

function ResourceTypeBadge({ type }: { type: ComicResourceType }) {
  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: "#f3e8ff",
        color: "#7c3aed",
      }}
    >
      {RESOURCE_TYPE_LABELS[type]}
    </Box>
  );
}

function StatusBadge({ status }: { status: DownloadTaskStatus }) {
  const config = TASK_STATUS_CONFIG[status];

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </Box>
  );
}

function PreparationStatusBadge({ status }: { status: DownloadPreparationStatus }) {
  const config = PREPARATION_STATUS_CONFIG[status];

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </Box>
  );
}

function TransferStatusBadge({ status }: { status: DownloadTransferStatus }) {
  const config = TRANSFER_STATUS_CONFIG[status];

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </Box>
  );
}

function EventOperationBadge({ operation }: { operation: DownloadTaskEventOperation }) {
  const config = EVENT_OPERATION_CONFIG[operation];

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </Box>
  );
}

function DispatchStatusBadge({ status }: { status: DownloadDispatchPlan["status"] }) {
  const config = DISPATCH_STATUS_CONFIG[status];

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </Box>
  );
}

function CloudScanStatusBadge({ status }: { status: CloudScanStatus }) {
  const config = CLOUD_SCAN_STATUS_CONFIG[status];

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </Box>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box>
      <Text size="xs" c="ink.4" fw={600}>
        {label}
      </Text>
      <Text fw={900} size="lg" c={color}>
        {value}
      </Text>
    </Box>
  );
}

function statusLabel(status: DownloadableResourceRecord["comicStatus"]) {
  const labels: Record<DownloadableResourceRecord["comicStatus"], string> = {
    deleted: "已删除",
    hidden: "已隐藏",
    missing_local_file: "缺文件",
    readable: "可读",
    remote_only: "远程",
  };

  return labels[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatReadinessDetails(details: Record<string, boolean | number | string | null> | undefined) {
  if (!details) {
    return [];
  }

  const entries: Array<{ label: string; value: string }> = [];
  const append = (key: string, label: string, formatter: (value: boolean | number | string | null) => string | null) => {
    if (!(key in details)) {
      return;
    }

    const value = formatter(details[key]);
    if (value) {
      entries.push({ label, value });
    }
  };

  append("remoteName", "远端文件", (value) => (typeof value === "string" && value.trim() ? value : null));
  append("remoteSizeBytes", "大小", (value) => (typeof value === "number" ? formatBytes(value) : null));
  append("remoteProvider", "OpenList 存储", (value) => (typeof value === "string" && value.trim() ? value : null));
  append("remoteIsDirectory", "类型", (value) => (typeof value === "boolean" ? (value ? "目录" : "文件") : null));
  append("rawUrlAvailable", "直链", (value) => (typeof value === "boolean" ? (value ? "已返回" : "未返回") : null));
  append("remoteChildCount", "目录子项", (value) => (typeof value === "number" ? String(value) : null));
  append("remoteFileCount", "预览文件", (value) => (typeof value === "number" ? String(value) : null));
  append("remoteDirectoryCount", "预览目录", (value) => (typeof value === "number" ? String(value) : null));
  append("remotePreviewNames", "预览", (value) => (typeof value === "string" && value.trim() ? value : null));

  return entries;
}

function formatCloudScanPreview(entries: CloudScanSessionRecord["previewEntries"]) {
  if (entries.length === 0) {
    return "暂无预览";
  }

  return entries.map((entry) => `${entry.kind === "directory" ? "目录" : "文件"}:${entry.name}`).join(" · ");
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
