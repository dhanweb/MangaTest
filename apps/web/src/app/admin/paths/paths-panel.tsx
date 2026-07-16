"use client";

import { ActionIcon, Box, Group, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { Folder, FolderOpen, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { AppBadge } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type { MangaRootWithStats, ScanSessionRecord } from "@/modules/library";

import { deleteMangaRootAction, scanMangaRootAction } from "./actions";
import { MangaRootEditDialog } from "./manga-root-edit-dialog";
import { SystemRootPathDialog } from "./system-root-path-dialog";
import { MangaRootDialog } from "./manga-root-dialog";

interface PathsPanelProps {
  mangaRoots: MangaRootWithStats[];
  scanSessions: ScanSessionRecord[];
}

export function PathsPanel({ mangaRoots, scanSessions }: PathsPanelProps) {
  const [search, setSearch] = useAdminTabState("search", "");
  const [openingRootId, setOpeningRootId] = useState<string | null>(null);

  const filteredRoots = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return mangaRoots;
    }

    return mangaRoots.filter(
      (root) =>
        root.absolutePath.toLowerCase().includes(query) || (root.displayName ?? "").toLowerCase().includes(query),
    );
  }, [mangaRoots, search]);

  const totalComics = mangaRoots.reduce((sum, root) => sum + root.comicCount, 0);
  const enabledRoots = mangaRoots.filter((root) => root.isEnabled).length;
  const latestSession = scanSessions[0];

  async function openRootFolder(rootId: string) {
    setOpeningRootId(rootId);
    try {
      const res = await fetch(`/api/admin/paths/${rootId}/open-folder`, { method: "POST" });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(data.error || "打开失败");
      } else {
        toast.success(data.message || "已打开");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开失败");
    }
    setOpeningRootId(null);
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
        <Folder size={22} style={{ flexShrink: 0, marginTop: 1 }} />
        <Box style={{ flex: 1 }}>
          <Text component="h1" size="20px" fw={700} mb={4}>
            漫画路径管理
          </Text>
          <Text size="sm" c="ink.5">
            管理漫画扫描路径，添加本地目录，系统会手动扫描并同步漫画。
          </Text>
        </Box>
      </Box>

      <Group gap="xl" mb="lg" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10 }}>
        <Stat label="总路径" value={mangaRoots.length} />
        <Stat label="可用路径" value={enabledRoots} tone="ok" />
        <Stat label="扫描漫画总数" value={totalComics} tone="primary" />
      </Group>

      <Group justify="space-between" mb="md">
        <TextInput
          placeholder="搜索路径或描述..."
          leftSection={<Search size={16} style={{ color: "var(--mantine-color-ink-5)" }} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          style={{ flex: 1, maxWidth: 420 }}
          styles={{
            input: {
              borderColor: "var(--mantine-color-pink-2)",
              borderRadius: "var(--mantine-radius-md)",
              "&:focus": { borderColor: "var(--mantine-color-pink-5)" },
            },
          }}
        />
        <MangaRootDialog />
      </Group>

      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e">
                路径
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={120}>
                描述
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={100}>
                状态
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={90}>
                漫画数量
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={140}>
                上次扫描
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={160}>
                操作
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredRoots.map((root) => (
              <Table.Tr key={root.id}>
                <Table.Td>
                  <Text
                    component="code"
                    size="sm"
                    style={{
                      fontFamily: "var(--mantine-font-family-monospace)",
                      overflowWrap: "anywhere",
                      color: "#201422",
                    }}
                  >
                    {root.absolutePath}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {root.kind === "system" && (
                      <Text component="span" size="sm" title="系统目录，不可删除">
                        🔒
                      </Text>
                    )}
                    <Text size="sm">
                      {root.kind === "system" ? "系统默认目录" : root.displayName || "本地漫画库"}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <StatusBadge enabled={root.isEnabled} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {root.comicCount}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="ink.5">
                    {root.lastScanSessionId ? root.lastScanSessionId.slice(0, 8) : "-"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="在资源管理器打开" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="pink"
                        size="md"
                        disabled={openingRootId === root.id}
                        onClick={() => openRootFolder(root.id)}
                        aria-label={`打开 ${root.absolutePath}`}
                      >
                        <FolderOpen size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <form action={scanMangaRootAction}>
                      <input name="mangaRootId" type="hidden" value={root.id} />
                      <Tooltip label="重新扫描" withArrow>
                        <ActionIcon variant="subtle" color="pink" size="md" type="submit" aria-label={`扫描 ${root.absolutePath}`}>
                          <RefreshCcw size={15} />
                        </ActionIcon>
                      </Tooltip>
                    </form>
                    {root.kind === "system" ? (
                      <SystemRootPathDialog root={root} />
                    ) : (
                      <MangaRootEditDialog root={root} />
                    )}
                    <form
                      action={deleteMangaRootAction}
                      onSubmit={(event) => {
                        if (!window.confirm(`只删除路径记录，不会删除真实文件。\n\n确认删除 ${root.absolutePath}？`)) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input name="mangaRootId" type="hidden" value={root.id} />
                      <Tooltip
                        label={
                          root.kind === "system"
                            ? "系统目录不可删除"
                            : root.comicCount > 0
                              ? "已有入库漫画，不能删除；可先停用路径"
                              : "删除路径记录"
                        }
                        withArrow
                      >
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="md"
                          type="submit"
                          disabled={root.kind === "system" || root.comicCount > 0}
                          aria-label={`删除 ${root.absolutePath}`}
                        >
                          <Trash2 size={15} />
                        </ActionIcon>
                      </Tooltip>
                    </form>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {filteredRoots.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="sm" c="ink.5" ta="center" py="md">
                    {mangaRoots.length === 0
                      ? "还没有配置 manga root。先添加一个绝对路径，再开始手动扫描。"
                      : "没有找到匹配的路径"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Box>

      {latestSession ? (
        <Group mt="md" gap="xs" wrap="wrap">
          <Text size="xs" fw={700} c="ink.7">
            最近扫描
          </Text>
          <AppBadge color={latestSession.status === "failed" ? "red" : "pink"}>{latestSession.status}</AppBadge>
          <Text size="xs" c="ink.5">
            新增 {latestSession.addedCount}
          </Text>
          <Text size="xs" c="ink.5">
            缺失 {latestSession.missingCount}
          </Text>
          <Text size="xs" c="ink.5">
            疑似重复 {latestSession.duplicateCandidateCount}
          </Text>
          {latestSession.errorSummary ? (
            <Text size="xs" fw={700} c="red">
              {latestSession.errorSummary}
            </Text>
          ) : null}
        </Group>
      ) : null}
    </Box>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 26,
        paddingInline: 10,
        borderRadius: 999,
        background: enabled ? "var(--mantine-color-green-0)" : "var(--mantine-color-gray-1)",
        color: enabled ? "var(--mantine-color-green-8)" : "var(--mantine-color-gray-7)",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {enabled ? "启用" : "停用"}
    </Box>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "primary";
}) {
  const color =
    tone === "ok" ? "var(--mantine-color-green-7)" : tone === "primary" ? "var(--mantine-color-pink-6)" : "var(--mantine-color-ink-8)";
  return (
    <Box style={{ textAlign: "center", minWidth: 72 }}>
      <Text size="lg" fw={700} style={{ color }}>
        {value}
      </Text>
      <Text size="xs" c="ink.5">
        {label}
      </Text>
    </Box>
  );
}
