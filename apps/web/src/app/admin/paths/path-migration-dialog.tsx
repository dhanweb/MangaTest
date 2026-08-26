"use client";

import { Alert, Box, Checkbox, Divider, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { AlertTriangle, ArrowRight, DatabaseBackup, GitCompareArrows, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { AppButton, AppInput, AppModal, AppSelect } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import { runtimeProfiles, type RuntimeProfile } from "@/modules/core/runtime-paths/runtime-profile-contract";
import type { PathMigrationReport, PathMigrationResult } from "@/modules/library/path-migration";

const PROFILE_LABELS: Record<RuntimeProfile, string> = {
  windows: "Windows",
  wsl: "WSL",
  linux: "Linux",
};

interface PathMigrationDialogProps {
  currentProfile: RuntimeProfile | null;
}

export function PathMigrationDialog({ currentProfile }: PathMigrationDialogProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [targetProfile, setTargetProfile] = useState<RuntimeProfile>(getDefaultTargetProfile(currentProfile));
  const [mappingValues, setMappingValues] = useState<Record<string, string>>({});
  const [report, setReport] = useState<PathMigrationReport | null>(null);
  const [result, setResult] = useState<PathMigrationResult | null>(null);
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  function handleOpen() {
    setTargetProfile(getDefaultTargetProfile(currentProfile));
    setMappingValues({});
    setReport(null);
    setResult(null);
    setConfirmBackup(false);
    setErrorMessage(null);
    open();
  }

  function handleClose() {
    if (isPreviewing || isApplying) {
      return;
    }
    close();
  }

  function handleTargetProfileChange(value: string | null) {
    if (!isRuntimeProfile(value)) {
      return;
    }

    setTargetProfile(value);
    setMappingValues({});
    setReport(null);
    setResult(null);
    setConfirmBackup(false);
    setErrorMessage(null);
  }

  async function preview() {
    setIsPreviewing(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/path-migration/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetProfile,
          rootMappings: Object.entries(mappingValues).map(([rootId, targetPath]) => ({ rootId, targetPath })),
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok || !isPathMigrationReport(payload)) {
        throw new Error(getApiError(payload, "生成路径迁移预览失败。"));
      }

      setReport(payload);
      setMappingValues(Object.fromEntries(payload.roots.map((root) => [root.rootId, root.targetPath ?? ""])));
      setConfirmBackup(false);
      toast.success("路径迁移预览已生成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成路径迁移预览失败。";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function apply() {
    if (!report || !canApplyReport(report, mappingValues, confirmBackup)) {
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/path-migration/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetProfile,
          rootMappings: report.roots.map((root) => ({ rootId: root.rootId, targetPath: mappingValues[root.rootId] ?? null })),
          fingerprint: report.fingerprint,
          confirmBackup: true,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok || !isPathMigrationResult(payload)) {
        throw new Error(getApiError(payload, "应用路径迁移失败。"));
      }

      setResult(payload);
      toast.success(`路径映射已更新，备份文件：${payload.backupFilename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "应用路径迁移失败。";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsApplying(false);
    }
  }

  const isDirty = report ? report.roots.some((root) => (mappingValues[root.rootId] ?? "") !== (root.targetPath ?? "")) : false;
  const canApply = Boolean(report && canApplyReport(report, mappingValues, confirmBackup) && !isDirty && !isPreviewing && !isApplying);

  return (
    <>
      <AppButton variant="outline" leftSection={<GitCompareArrows size={16} />} onClick={handleOpen}>
        跨环境迁移
      </AppButton>

      <AppModal
        opened={opened}
        onClose={handleClose}
        title="跨环境路径迁移"
        description="只更新运行环境路径映射，不移动漫画文件。迁移前会自动创建 SQLite 备份。"
        size="lg"
        draggable
        preventClose={isPreviewing || isApplying}
        bodyMaxHeight="calc(100dvh - 190px)"
        footer={
          <>
            <AppButton variant="outline" disabled={isPreviewing || isApplying} onClick={handleClose}>
              {result ? "关闭" : "取消"}
            </AppButton>
            {!result ? (
              <>
                <AppButton variant="outline" loading={isPreviewing} onClick={() => void preview()} leftSection={<ShieldCheck size={16} />}>
                  生成预览
                </AppButton>
                <AppButton tone="danger" disabled={!canApply} loading={isApplying} onClick={() => void apply()} leftSection={<DatabaseBackup size={16} />}>
                  创建备份并应用
                </AppButton>
              </>
            ) : null}
          </>
        }
      >
        <Stack gap="md" py="sm">
          <Group grow align="flex-end">
            <Box>
              <Text size="sm" fw={700} mb={5}>当前运行环境</Text>
              <Text size="sm" c="ink.7" style={{ minHeight: 36, display: "flex", alignItems: "center" }}>
                {currentProfile ? PROFILE_LABELS[currentProfile] : "未知"}
              </Text>
            </Box>
            <AppSelect
              label="目标运行环境"
              value={targetProfile}
              onChange={handleTargetProfileChange}
              data={runtimeProfiles.map((profile) => ({ value: profile, label: PROFILE_LABELS[profile] }))}
              allowDeselect={false}
            />
          </Group>

          <Alert color="pink" icon={<ShieldCheck size={18} />}>
            迁移只会写入目标 profile 的根目录位置，并同步数据库中的兼容路径字段；不会创建、移动、重命名或删除任何真实漫画文件。
          </Alert>

          {errorMessage ? (
            <Alert color="red" icon={<AlertTriangle size={18} />}>
              {errorMessage}
            </Alert>
          ) : null}

          {!report && !isPreviewing ? (
            <Text size="sm" c="ink.5">
              选择目标环境后生成只读预览。预览会检查每个根目录的目标位置、活动传输任务和业务 ID 摘要。
            </Text>
          ) : null}

          {report ? (
            <>
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Text size="sm" fw={700}>迁移预览</Text>
                  <Text size="xs" c="ink.5" mt={3}>
                    {PROFILE_LABELS[report.sourceProfile]} <ArrowRight size={12} style={{ verticalAlign: "-2px" }} /> {PROFILE_LABELS[report.targetProfile]} · 指纹 {report.fingerprint.slice(0, 12)}…
                  </Text>
                </Box>
                <StatusBadge ready={report.canApply} label={report.canApply ? "安全检查通过" : "需要处理阻塞项"} />
              </Group>

              <Stack gap="sm">
                {report.roots.map((root) => (
                  <Box key={root.rootId} p="sm" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10 }}>
                    <Text size="sm" fw={700} mb={5}>{root.rootId}</Text>
                    <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                      当前：{root.sourcePath}
                    </Text>
                    <AppInput
                      label="目标位置"
                      size="sm"
                      mt="xs"
                      value={mappingValues[root.rootId] ?? ""}
                      onChange={(event) => setMappingValues((current) => ({ ...current, [root.rootId]: event.currentTarget.value }))}
                      description={`本地文件 ${root.localFileCount} 条 · ${root.status === "ready" ? "目标目录可访问" : root.status === "offline" ? "目标目录不可访问" : "无法生成目标路径"}`}
                    />
                  </Box>
                ))}
              </Stack>

              {isDirty ? (
                <Alert color="yellow" icon={<AlertTriangle size={18} />}>
                  目标位置已修改，请重新生成预览后才能应用。
                </Alert>
              ) : null}

              {report.blockers.length ? (
                <Box p="sm" style={{ background: "var(--mantine-color-red-0)", borderRadius: 10 }}>
                  <Text size="sm" fw={700} c="red.8">阻塞项</Text>
                  <Stack gap={4} mt="xs">
                    {report.blockers.map((blocker, index) => (
                      <Text size="xs" c="red.8" key={`${blocker.code}-${blocker.recordId}-${index}`}>
                        · {blocker.message}
                      </Text>
                    ))}
                  </Stack>
                </Box>
              ) : null}

              <Divider />
              <Checkbox
                checked={confirmBackup}
                onChange={(event) => setConfirmBackup(event.currentTarget.checked)}
                label="我确认应用前会创建可恢复的 SQLite 备份，并理解本操作不会移动真实漫画文件。"
                disabled={Boolean(result) || isApplying}
              />

              {!report.canApply ? (
                <Text size="xs" c="ink.5">所有根目录都必须通过目标位置检查，且不能存在活动中的下载传输任务。</Text>
              ) : null}
            </>
          ) : null}

          {result ? (
            <Alert color="green" icon={<DatabaseBackup size={18} />}>
              <Text size="sm" fw={700}>迁移完成</Text>
              <Text size="sm" mt={4}>备份文件：{result.backupFilename}</Text>
              <Text size="xs" mt={4}>更新根目录 {result.updatedRootCount} 个，本地文件 {result.updatedLocalFileCount} 条。备份位置：{result.backupPath}</Text>
            </Alert>
          ) : null}
        </Stack>
      </AppModal>
    </>
  );
}

function getDefaultTargetProfile(currentProfile: RuntimeProfile | null): RuntimeProfile {
  return currentProfile === "windows" ? "wsl" : "windows";
}

function isRuntimeProfile(value: unknown): value is RuntimeProfile {
  return typeof value === "string" && runtimeProfiles.includes(value as RuntimeProfile);
}

function canApplyReport(report: PathMigrationReport, mappingValues: Record<string, string>, confirmBackup: boolean) {
  return report.canApply && confirmBackup && report.roots.every((root) => Boolean(mappingValues[root.rootId]?.trim()));
}

function isPathMigrationReport(value: unknown): value is PathMigrationReport {
  if (!isRecord(value) || typeof value.fingerprint !== "string" || typeof value.sourceProfile !== "string" || typeof value.targetProfile !== "string" || !Array.isArray(value.roots) || !Array.isArray(value.blockers) || typeof value.canApply !== "boolean") {
    return false;
  }

  return isRuntimeProfile(value.sourceProfile) && isRuntimeProfile(value.targetProfile) && value.roots.every(isPathMigrationRootReport) && value.blockers.every(isPathMigrationBlocker);
}

function isPathMigrationRootReport(value: unknown): value is PathMigrationReport["roots"][number] {
  return isRecord(value) && typeof value.rootId === "string" && typeof value.sourcePath === "string" && (value.suggestedTargetPath === null || typeof value.suggestedTargetPath === "string") && (value.targetPath === null || typeof value.targetPath === "string") && ["ready", "unmappable", "offline"].includes(String(value.status)) && typeof value.localFileCount === "number";
}

function isPathMigrationBlocker(value: unknown): value is PathMigrationReport["blockers"][number] {
  return isRecord(value) && ["active_transfer", "unmappable_path", "target_offline"].includes(String(value.code)) && typeof value.recordId === "string" && typeof value.message === "string";
}

function isPathMigrationResult(value: unknown): value is PathMigrationResult {
  return isRecord(value) && typeof value.backupFilename === "string" && typeof value.backupPath === "string" && isPathMigrationReport(value.report) && typeof value.updatedRootCount === "number" && typeof value.updatedLocalFileCount === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getApiError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function StatusBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <Box component="span" style={{ display: "inline-flex", alignItems: "center", minHeight: 26, paddingInline: 10, borderRadius: 999, background: ready ? "var(--mantine-color-green-0)" : "var(--mantine-color-red-0)", color: ready ? "var(--mantine-color-green-8)" : "var(--mantine-color-red-8)", fontSize: 12, fontWeight: 700 }}>
      {label}
    </Box>
  );
}
