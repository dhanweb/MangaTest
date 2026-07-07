"use client";

import { ActionIcon, Box, Group, Stack, Table, Text, Tooltip } from "@mantine/core";
import { CheckCircle2, CloudDownload, Plus, RotateCcw, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { AppButton, AppInput, AppSelect } from "@/components/ui/app-components";
import type { ComicResourceType, DownloadableResourceRecord, DownloadProvider, DownloadTaskRecord, DownloadTaskStatus } from "@/modules/downloads";

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

type DownloadsApiResponse = {
  resources?: DownloadableResourceRecord[];
  tasks?: DownloadTaskRecord[];
  task?: DownloadTaskRecord;
  created?: boolean;
  error?: string;
};

export function DownloadsPanel({ resources, tasks }: { resources: DownloadableResourceRecord[]; tasks: DownloadTaskRecord[] }) {
  const [resourceItems, setResourceItems] = useState(resources);
  const [taskItems, setTaskItems] = useState(tasks);
  const [search, setSearch] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(() => resources[0]?.id ?? null);
  const [provider, setProvider] = useState<DownloadProvider>(() => resources[0]?.defaultProvider ?? "aria2");
  const [targetDirectory, setTargetDirectory] = useState("");
  const [pendingResourceId, setPendingResourceId] = useState<string | null>(null);
  const [pendingTaskAction, setPendingTaskAction] = useState<string | null>(null);
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
      [task.comicTitle, task.resourceLabel, task.redactedResource, task.sourceSite ?? "", PROVIDER_LABELS[task.provider], TASK_STATUS_CONFIG[task.status].label]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [taskItems, search]);

  const activeTaskCount = taskItems.filter((task) => task.status === "queued" || task.status === "running" || task.status === "cancel_requested").length;
  const failedTaskCount = taskItems.filter((task) => task.status === "failed").length;
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

  async function refreshDownloads(preferredResourceId: string | null) {
    const response = await fetch("/api/downloads");
    const payload = (await response.json()) as DownloadsApiResponse;

    if (!response.ok || !payload.resources || !payload.tasks) {
      return;
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
        <Stat label="失败任务" value={failedTaskCount} color="#d93a4e" />
        <Stat label="任务总数" value={taskItems.length} color="#4f46e5" />
      </Group>

      <Stack gap="md">
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
              placeholder="可选，必须为绝对路径"
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
                    <Table.Td colSpan={7}>
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
