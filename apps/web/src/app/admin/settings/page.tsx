"use client";

import { Box, Group, Stack, Text } from "@mantine/core";
import { Download, Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { AppButton, AppInput, AppSelect, AppSwitch } from "@/components/ui/app-components";
import { defaultRuntimeSettings } from "@/modules/core/settings/defaults";
import type { RuntimeSettings } from "@/modules/core/settings/types";
import type {
  OpenListConnectionCheckResult,
  OpenListConnectionStatus,
  OpenListLoginResult,
  OpenListLoginStatus,
} from "@/modules/downloads/providers/openlist";

type SettingsTab = (typeof TABS)[number];
type PublicOpenListLoginResult = Omit<OpenListLoginResult, "token">;

const TABS = ["常规设置", "阅读设置", "扫描设置", "下载设置", "安全设置"] as const;

const OPENLIST_STATUS_CONFIG: Record<OpenListConnectionStatus, { label: string; color: string }> = {
  disabled: { label: "未启用", color: "#53606c" },
  invalid_response: { label: "响应异常", color: "#b86b00" },
  missing_settings: { label: "缺少配置", color: "#b86b00" },
  reachable: { label: "连接正常", color: "#00894a" },
  unauthorized: { label: "认证失败", color: "#d93a4e" },
  unreachable: { label: "不可达", color: "#d93a4e" },
};

const OPENLIST_LOGIN_STATUS_CONFIG: Record<OpenListLoginStatus, { label: string; color: string }> = {
  invalid_response: { label: "响应异常", color: "#b86b00" },
  missing_settings: { label: "缺少信息", color: "#b86b00" },
  success: { label: "登录成功", color: "#00894a" },
  unauthorized: { label: "认证失败", color: "#d93a4e" },
  unreachable: { label: "不可达", color: "#d93a4e" },
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("常规设置");
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(defaultRuntimeSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isCheckingOpenList, setIsCheckingOpenList] = useState(false);
  const [isLoggingInOpenList, setIsLoggingInOpenList] = useState(false);
  const [openListCheckResult, setOpenListCheckResult] = useState<OpenListConnectionCheckResult | null>(null);
  const [openListLoginResult, setOpenListLoginResult] = useState<PublicOpenListLoginResult | null>(null);
  const [openListLoginUsername, setOpenListLoginUsername] = useState("");
  const [openListLoginPassword, setOpenListLoginPassword] = useState("");
  const [openListLoginOtp, setOpenListLoginOtp] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [backupMessage, setBackupMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    fetch("/api/settings")
      .then((response) => response.json())
      .then((payload: { settings?: RuntimeSettings }) => {
        if (isMounted && payload.settings) {
          setRuntimeSettings(payload.settings);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  async function saveSettings() {
    setIsSaving(true);
    setSavedMessage("");
    setSaveError("");

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(runtimeSettings),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { settings?: RuntimeSettings; error?: string };

      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? "设置保存失败。");
      }

      setRuntimeSettings(payload.settings);
      setSavedMessage("设置已保存");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "设置保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function exportSqliteBackup() {
    setIsExportingBackup(true);
    setBackupMessage("");

    try {
      const response = await fetch("/api/settings/backup");

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "SQLite 备份导出失败。");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = parseAttachmentFilename(disposition) ?? "mangatest-backup.sqlite";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupMessage("备份已开始下载");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "SQLite 备份导出失败。");
    } finally {
      setIsExportingBackup(false);
    }
  }

  async function checkOpenListConnection() {
    setIsCheckingOpenList(true);
    setOpenListCheckResult(null);

    try {
      const response = await fetch("/api/settings/openlist/check", { method: "POST" });
      const payload = (await response.json()) as { result?: OpenListConnectionCheckResult; error?: string };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "OpenList 连接校验失败。");
      }

      setOpenListCheckResult(payload.result);
    } catch (error) {
      setOpenListCheckResult({
        ok: false,
        status: "unreachable",
        checkedAt: new Date().toISOString(),
        baseUrl: runtimeSettings.openlistBaseUrl.trim() || null,
        tokenConfigured: Boolean(runtimeSettings.openlistToken.trim()),
        message: error instanceof Error ? error.message : "OpenList 连接校验失败。",
        publicApi: null,
        accountApi: null,
      });
    } finally {
      setIsCheckingOpenList(false);
    }
  }

  async function loginOpenList() {
    setIsLoggingInOpenList(true);
    setOpenListLoginResult(null);

    try {
      const response = await fetch("/api/settings/openlist/login", {
        body: JSON.stringify({
          baseUrl: runtimeSettings.openlistBaseUrl,
          otpCode: openListLoginOtp,
          password: openListLoginPassword,
          username: openListLoginUsername,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        result?: PublicOpenListLoginResult;
        settings?: RuntimeSettings;
      };

      if (!payload.result) {
        throw new Error(payload.error ?? "OpenList 登录失败。");
      }

      setOpenListLoginResult(payload.result);

      if (!response.ok || !payload.settings) {
        return;
      }

      setRuntimeSettings(payload.settings);
      setOpenListLoginPassword("");
      setOpenListLoginOtp("");
      setOpenListCheckResult(null);
    } catch (error) {
      setOpenListLoginResult({
        authApi: null,
        baseUrl: runtimeSettings.openlistBaseUrl.trim() || null,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "OpenList 登录失败。",
        ok: false,
        status: "unreachable",
        tokenConfigured: false,
      });
    } finally {
      setIsLoggingInOpenList(false);
    }
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
        <Settings size={22} style={{ flexShrink: 0, marginTop: 1 }} />
        <Box>
          <Text component="h1" size="20px" fw={700} mb={4}>
            系统设置
          </Text>
          <Text size="sm" c="ink.5">
            配置漫画库根目录、阅读行为、扫描规则和安全选项。
          </Text>
        </Box>
      </Box>

      <Box style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 20, borderBottom: "1px solid #fde6ef" }} role="tablist">
        {TABS.map((tab) => (
          <AppButton
            key={tab}
            variant="transparent"
            size="sm"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            styles={{
              root: {
                minHeight: 40,
                padding: "0 18px",
                fontWeight: 900,
                fontSize: 14,
                border: "none",
                borderBottom: activeTab === tab ? "2px solid var(--mantine-color-pink-5)" : "2px solid transparent",
                borderRadius: 0,
                background: "transparent",
                color: activeTab === tab ? "var(--mantine-color-pink-5)" : "#7a4d60",
                transition: "color 160ms ease, border-color 160ms ease",
                "&:hover": { background: "var(--mantine-color-pink-1)" },
              },
            }}
          >
            {tab}
          </AppButton>
        ))}
      </Box>

      <Box>
        {activeTab === "常规设置" && (
          <GeneralSettings
            isSaving={isSaving}
            onSave={saveSettings}
            onSettingsChange={setRuntimeSettings}
            saveError={saveError}
            savedMessage={savedMessage}
            settings={runtimeSettings}
          />
        )}
        {activeTab === "阅读设置" && (
          <ReaderSettings
            isSaving={isSaving}
            onSave={saveSettings}
            onSettingsChange={setRuntimeSettings}
            saveError={saveError}
            savedMessage={savedMessage}
            settings={runtimeSettings}
          />
        )}
        {activeTab === "扫描设置" && <ScanSettings />}
        {activeTab === "下载设置" && (
          <DownloadSettings
            checkResult={openListCheckResult}
            isCheckingOpenList={isCheckingOpenList}
            isLoggingInOpenList={isLoggingInOpenList}
            isSaving={isSaving}
            loginOtp={openListLoginOtp}
            loginPassword={openListLoginPassword}
            loginResult={openListLoginResult}
            loginUsername={openListLoginUsername}
            onCheckOpenList={checkOpenListConnection}
            onLoginOpenList={loginOpenList}
            onSave={saveSettings}
            onSetLoginOtp={setOpenListLoginOtp}
            onSetLoginPassword={setOpenListLoginPassword}
            onSetLoginUsername={setOpenListLoginUsername}
            onSettingsChange={setRuntimeSettings}
            saveError={saveError}
            savedMessage={savedMessage}
            settings={runtimeSettings}
          />
        )}
        {activeTab === "安全设置" && (
          <SecuritySettings
            backupMessage={backupMessage}
            isExportingBackup={isExportingBackup}
            isSaving={isSaving}
            onExportBackup={exportSqliteBackup}
            onSave={saveSettings}
            onSettingsChange={setRuntimeSettings}
            saveError={saveError}
            savedMessage={savedMessage}
            settings={runtimeSettings}
          />
        )}
      </Box>
    </Box>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box mb="lg">
      <Text fw={700} size="sm" c="#3a2034" mb="xs">
        {title}
      </Text>
      <Stack gap={0} style={{ border: "1px solid #fde6ef", borderRadius: 10, overflow: "hidden" }}>
        {children}
      </Stack>
    </Box>
  );
}

function SettingsRow({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 18,
        alignItems: "center",
        minHeight: 60,
        padding: "12px 18px",
        borderBottom: "1px solid #fde6ef",
      }}
    >
      <Box>
        <Text fw={600} size="15px">
          {label}
        </Text>
        {note && (
          <Text size="xs" c="ink.5" mt={2}>
            {note}
          </Text>
        )}
      </Box>
      <Box style={{ minWidth: 180, display: "flex", justifyContent: "flex-end" }}>{children}</Box>
    </Box>
  );
}

function GeneralSettings({
  isSaving,
  onSave,
  onSettingsChange,
  saveError,
  savedMessage,
  settings,
}: {
  isSaving: boolean;
  onSave: () => void;
  onSettingsChange: (settings: RuntimeSettings) => void;
  saveError: string;
  savedMessage: string;
  settings: RuntimeSettings;
}) {
  return (
    <>
      <SettingsGroup title="路径配置">
        <SettingsRow label="漫画根目录" note="所有漫画文件的存放根路径，必须是绝对路径。">
          <AppInput value="见漫画路径页" readOnly style={{ width: 280 }} />
        </SettingsRow>
        <SettingsRow label="数据目录" note="系统元数据、封面缓存、缩略图存放位置。">
          <AppInput
            value={settings.cacheDirectory}
            onChange={(event) => onSettingsChange({ ...settings, cacheDirectory: event.currentTarget.value })}
            style={{ width: 280 }}
          />
        </SettingsRow>
        <SettingsRow label="缓存大小上限" note="单位 MB，缓存清理会按大小上限和过期时间双策略执行。">
          <AppInput
            type="number"
            value={String(settings.cacheSizeMb)}
            onChange={(event) => onSettingsChange({ ...settings, cacheSizeMb: Number(event.currentTarget.value) })}
            style={{ width: 140 }}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="服务配置">
        <SettingsRow label="监听地址" note="本地服务绑定的 IP 地址。">
          <AppInput
            value={settings.listenHost}
            onChange={(event) => onSettingsChange({ ...settings, listenHost: event.currentTarget.value })}
            style={{ width: 280 }}
          />
        </SettingsRow>
        <SettingsRow label="端口号" note="HTTP 服务端口，修改后需重启。">
          <AppInput value="4317" readOnly style={{ width: 120 }} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="外观">
        <SettingsRow label="主题模式" note="MVP 先固定浅色主题，避免未适配的暗色组件造成低对比度。">
          <AppInput value="浅色" readOnly style={{ width: 180 }} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="自动化">
        <SettingsRow label="启动时自动扫描" note="MVP 阶段保留设置入口，当前由后台手动触发扫描。">
          <AppSwitch disabled aria-label="自动扫描" />
        </SettingsRow>
        <SettingsRow label="定时扫描" note="按 cron 表达式定时扫描目录变更。">
          <AppInput value="未启用" readOnly style={{ width: 180 }} />
        </SettingsRow>
      </SettingsGroup>

      <Group justify="flex-end" mt="md">
        {saveError && (
          <Text size="sm" c="red.7">
            {saveError}
          </Text>
        )}
        {savedMessage && (
          <Text size="sm" c="green.7">
            {savedMessage}
          </Text>
        )}
        <AppButton loading={isSaving} onClick={onSave}>
          保存常规设置
        </AppButton>
      </Group>
    </>
  );
}

function ReaderSettings({
  isSaving,
  onSave,
  onSettingsChange,
  saveError,
  savedMessage,
  settings,
}: {
  isSaving: boolean;
  onSave: () => void;
  onSettingsChange: (settings: RuntimeSettings) => void;
  saveError: string;
  savedMessage: string;
  settings: RuntimeSettings;
}) {
  return (
    <>
      <SettingsGroup title="阅读行为">
        <SettingsRow label="默认阅读模式" note="打开漫画后的阅读方式。">
          <AppSelect value="滚动模式" data={["滚动模式", "分页模式"].map((value) => ({ value, label: value }))} disabled />
        </SettingsRow>
        <SettingsRow label="图片预加载" note="提前加载后续页面图片以减少等待。">
          <AppSwitch
            checked={settings.readerPreloadEnabled}
            onChange={(event) => onSettingsChange({ ...settings, readerPreloadEnabled: event.currentTarget.checked })}
            aria-label="图片预加载"
          />
        </SettingsRow>
        <SettingsRow label="阅读进度记录" note="自动记录每本漫画的阅读位置。">
          <AppSwitch defaultChecked disabled aria-label="阅读进度" />
        </SettingsRow>
        <SettingsRow label="默认显示缩略图侧栏" note="桌面端打开 reader 时默认显示页面缩略图侧栏。">
          <AppSwitch
            checked={settings.readerThumbnailSidebarDefault}
            onChange={(event) => onSettingsChange({ ...settings, readerThumbnailSidebarDefault: event.currentTarget.checked })}
            aria-label="默认显示缩略图侧栏"
          />
        </SettingsRow>
        <SettingsRow label="默认沉浸阅读" note="打开 reader 时默认隐藏顶部工具栏。">
          <AppSwitch
            checked={settings.readerImmersiveDefault}
            onChange={(event) => onSettingsChange({ ...settings, readerImmersiveDefault: event.currentTarget.checked })}
            aria-label="默认沉浸阅读"
          />
        </SettingsRow>
        <SettingsRow label="预加载页数" note="当前页之后提前预加载的图片页数。">
          <AppInput
            type="number"
            value={String(settings.readerPreloadAheadPages)}
            onChange={(event) => onSettingsChange({ ...settings, readerPreloadAheadPages: Number(event.currentTarget.value) })}
            style={{ width: 120 }}
          />
        </SettingsRow>
        <SettingsRow label="Reader 缩略图过期天数" note="超过该天数未访问的 reader 缩略图可被清理。">
          <AppInput
            type="number"
            value={String(settings.readerThumbnailTtlDays)}
            onChange={(event) => onSettingsChange({ ...settings, readerThumbnailTtlDays: Number(event.currentTarget.value) })}
            style={{ width: 120 }}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="快捷键">
        {[
          ["向上滚动", "↑ / W"],
          ["向下滚动", "↓ / S"],
          ["向下翻页", "Space"],
          ["向上翻页", "Shift + Space"],
          ["跳到开头", "Home"],
          ["跳到末尾", "End"],
          ["显示/隐藏工具栏", "T"],
          ["返回详情页", "Esc"],
        ].map(([label, key]) => (
          <SettingsRow key={label} label={label}>
            <Box
              component="kbd"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 60,
                minHeight: 32,
                padding: "0 10px",
                border: "1px solid var(--mantine-color-pink-2)",
                borderRadius: 7,
                background: "white",
                fontFamily: "var(--mantine-font-family-monospace)",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {key}
            </Box>
          </SettingsRow>
        ))}
      </SettingsGroup>

      <Group justify="flex-end" mt="md">
        {saveError && (
          <Text size="sm" c="red.7">
            {saveError}
          </Text>
        )}
        {savedMessage && (
          <Text size="sm" c="green.7">
            {savedMessage}
          </Text>
        )}
        <AppButton loading={isSaving} onClick={onSave}>
          保存阅读设置
        </AppButton>
      </Group>
    </>
  );
}

function DownloadSettings({
  checkResult,
  isCheckingOpenList,
  isLoggingInOpenList,
  isSaving,
  loginOtp,
  loginPassword,
  loginResult,
  loginUsername,
  onCheckOpenList,
  onLoginOpenList,
  onSave,
  onSetLoginOtp,
  onSetLoginPassword,
  onSetLoginUsername,
  onSettingsChange,
  saveError,
  savedMessage,
  settings,
}: {
  checkResult: OpenListConnectionCheckResult | null;
  isCheckingOpenList: boolean;
  isLoggingInOpenList: boolean;
  isSaving: boolean;
  loginOtp: string;
  loginPassword: string;
  loginResult: PublicOpenListLoginResult | null;
  loginUsername: string;
  onCheckOpenList: () => void;
  onLoginOpenList: () => void;
  onSave: () => void;
  onSetLoginOtp: (value: string) => void;
  onSetLoginPassword: (value: string) => void;
  onSetLoginUsername: (value: string) => void;
  onSettingsChange: (settings: RuntimeSettings) => void;
  saveError: string;
  savedMessage: string;
  settings: RuntimeSettings;
}) {
  return (
    <>
      <SettingsGroup title="下载入库">
        <SettingsRow label="默认下载目录" note="任务未指定目标目录时使用的绝对路径。">
          <AppInput
            value={settings.downloadDefaultTargetDirectory}
            onChange={(event) => onSettingsChange({ ...settings, downloadDefaultTargetDirectory: event.currentTarget.value })}
            placeholder="例如 D:\\Manga\\下载入库"
            style={{ width: 320 }}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="OpenList">
        <SettingsRow label="启用 OpenList" note="只保存连接配置；任务执行仍由后续 provider 实现。">
          <AppSwitch
            checked={settings.openlistEnabled}
            onChange={(event) => onSettingsChange({ ...settings, openlistEnabled: event.currentTarget.checked })}
            aria-label="启用 OpenList"
          />
        </SettingsRow>
        <SettingsRow label="服务地址" note="OpenList API 的 http 或 https 地址。">
          <AppInput
            value={settings.openlistBaseUrl}
            onChange={(event) => onSettingsChange({ ...settings, openlistBaseUrl: event.currentTarget.value })}
            placeholder="http://127.0.0.1:5244"
            style={{ width: 320 }}
          />
        </SettingsRow>
        <SettingsRow label="访问 token" note="仅保存在本地 SQLite 设置表。">
          <AppInput
            type="password"
            value={settings.openlistToken}
            onChange={(event) => onSettingsChange({ ...settings, openlistToken: event.currentTarget.value })}
            placeholder="未配置"
            style={{ width: 320 }}
          />
        </SettingsRow>
        <SettingsRow label="连接校验" note="只读请求 OpenList public API 和账号 API，不创建下载任务。">
          <AppButton loading={isCheckingOpenList} onClick={onCheckOpenList}>
            校验连接
          </AppButton>
        </SettingsRow>
        <SettingsRow label="账号登录" note="用户名、密码和 OTP 只用于本次换取 token，不会写入设置。">
          <Stack gap={8} style={{ width: 320 }}>
            <AppInput value={loginUsername} onChange={(event) => onSetLoginUsername(event.currentTarget.value)} placeholder="用户名" />
            <AppInput
              type="password"
              value={loginPassword}
              onChange={(event) => onSetLoginPassword(event.currentTarget.value)}
              placeholder="密码"
            />
            <AppInput value={loginOtp} onChange={(event) => onSetLoginOtp(event.currentTarget.value)} placeholder="OTP，可选" />
            <AppButton loading={isLoggingInOpenList} onClick={onLoginOpenList}>
              登录并保存 token
            </AppButton>
          </Stack>
        </SettingsRow>
      </SettingsGroup>

      {loginResult && <OpenListLoginResultPanel result={loginResult} />}
      {checkResult && <OpenListConnectionResult result={checkResult} />}

      <SettingsGroup title="Provider">
        <SettingsRow label="aria2" note="后续用于磁链和 torrent 任务。">
          <AppSwitch disabled aria-label="aria2 provider" />
        </SettingsRow>
        <SettingsRow label="内置 HTTP" note="后续用于直链下载任务。">
          <AppSwitch disabled aria-label="内置 HTTP provider" />
        </SettingsRow>
      </SettingsGroup>

      <Group justify="flex-end" mt="md">
        {saveError && (
          <Text size="sm" c="red.7">
            {saveError}
          </Text>
        )}
        {savedMessage && (
          <Text size="sm" c="green.7">
            {savedMessage}
          </Text>
        )}
        <AppButton loading={isSaving} onClick={onSave}>
          保存下载设置
        </AppButton>
      </Group>
    </>
  );
}

function OpenListLoginResultPanel({ result }: { result: PublicOpenListLoginResult }) {
  const status = OPENLIST_LOGIN_STATUS_CONFIG[result.status];

  return (
    <Box mb="lg" p="md" style={{ border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, background: "white" }}>
      <Group justify="space-between" align="flex-start" gap="md">
        <Box style={{ minWidth: 0 }}>
          <Text fw={900} c={status.color}>
            {status.label}
          </Text>
          <Text size="sm" c="ink.6" mt={4}>
            {result.message}
          </Text>
        </Box>
        <Text size="xs" c="ink.5">
          {formatDate(result.checkedAt)}
        </Text>
      </Group>
      <Group gap="lg" mt="sm" wrap="wrap">
        <OpenListCheckMetric label="服务地址" value={result.baseUrl ?? "未配置"} />
        <OpenListCheckMetric label="Token" value={result.tokenConfigured ? "已保存" : "未保存"} />
        <OpenListCheckMetric label="登录 API" value={formatEndpointCheck(result.authApi)} />
      </Group>
    </Box>
  );
}

function OpenListConnectionResult({ result }: { result: OpenListConnectionCheckResult }) {
  const status = OPENLIST_STATUS_CONFIG[result.status];

  return (
    <Box mb="lg" p="md" style={{ border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, background: "white" }}>
      <Group justify="space-between" align="flex-start" gap="md">
        <Box style={{ minWidth: 0 }}>
          <Text fw={900} c={status.color}>
            {status.label}
          </Text>
          <Text size="sm" c="ink.6" mt={4}>
            {result.message}
          </Text>
        </Box>
        <Text size="xs" c="ink.5">
          {formatDate(result.checkedAt)}
        </Text>
      </Group>
      <Group gap="lg" mt="sm" wrap="wrap">
        <OpenListCheckMetric label="服务地址" value={result.baseUrl ?? "未配置"} />
        <OpenListCheckMetric label="Token" value={result.tokenConfigured ? "已配置" : "未配置"} />
        <OpenListCheckMetric label="Public API" value={formatEndpointCheck(result.publicApi)} />
        <OpenListCheckMetric label="账号 API" value={formatEndpointCheck(result.accountApi)} />
      </Group>
    </Box>
  );
}

function OpenListCheckMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box style={{ minWidth: 130, maxWidth: 300 }}>
      <Text size="xs" c="ink.4" fw={700}>
        {label}
      </Text>
      <Text size="sm" fw={800} c="ink.8" style={{ overflowWrap: "anywhere" }}>
        {value}
      </Text>
    </Box>
  );
}

function formatEndpointCheck(value: OpenListConnectionCheckResult["publicApi"]) {
  if (!value) {
    return "未请求";
  }

  if (value.status == null) {
    return "请求失败";
  }

  return value.code == null ? `HTTP ${value.status}` : `HTTP ${value.status} / code ${value.code}`;
}

function ScanSettings() {
  return (
    <>
      <SettingsGroup title="文件扫描">
        <SettingsRow label="支持格式" note="当前支持的漫画文件格式。">
          <Box style={{ display: "flex", gap: 6 }}>
            {["ZIP", "CBZ", "目录"].map((format) => (
              <Box
                key={format}
                component="span"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 7,
                  fontWeight: 700,
                  fontSize: 12,
                  background: "#e4f9ed",
                  color: "#00894a",
                }}
              >
                {format}
              </Box>
            ))}
          </Box>
        </SettingsRow>
        <SettingsRow label="忽略目录" note="扫描时自动忽略的目录或文件。">
          <AppInput value="__MACOSX, .DS_Store, .thumb" readOnly style={{ width: 280 }} />
        </SettingsRow>
        <SettingsRow label="封面优先级" note="自动选择封面的优先级策略。">
          <AppSelect
            value="cover"
            data={[
              { value: "cover", label: "cover.* 文件优先" },
              { value: "first", label: "第一页优先" },
            ]}
            disabled
          />
        </SettingsRow>
        <SettingsRow label="扫描后生成缩略图" note="扫描完成后自动生成缩略图缓存。">
          <AppSwitch disabled aria-label="生成缩略图" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="文件校验">
        <SettingsRow label="计算文件 hash" note="扫描时计算 SHA-256 用于重复检测和路径修复。">
          <AppSwitch disabled aria-label="计算 hash" />
        </SettingsRow>
        <SettingsRow label="自动修复路径" note="检测到文件移动后自动更新数据库路径。">
          <AppSwitch disabled aria-label="自动修复路径" />
        </SettingsRow>
      </SettingsGroup>

      <Group justify="flex-end" mt="md">
        <AppButton disabled>保存扫描设置</AppButton>
      </Group>
    </>
  );
}

function SecuritySettings({
  backupMessage,
  isExportingBackup,
  isSaving,
  onExportBackup,
  onSave,
  onSettingsChange,
  saveError,
  savedMessage,
  settings,
}: {
  backupMessage: string;
  isExportingBackup: boolean;
  isSaving: boolean;
  onExportBackup: () => void;
  onSave: () => void;
  onSettingsChange: (settings: RuntimeSettings) => void;
  saveError: string;
  savedMessage: string;
  settings: RuntimeSettings;
}) {
  return (
    <>
      <SettingsGroup title="备份与恢复">
        <SettingsRow label="SQLite 备份导出" note="导出当前数据库快照，不包含漫画原始文件和缓存图片。">
          <AppButton leftSection={<Download size={15} />} loading={isExportingBackup} onClick={onExportBackup}>
            导出备份
          </AppButton>
        </SettingsRow>
        <SettingsRow label="备份范围" note="包含漫画记录、阅读进度、标签、设置、扫描和操作日志。">
          <AppInput value="mangatest.sqlite" readOnly style={{ width: 180 }} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="接口保护">
        <SettingsRow label="导入令牌" note="浏览器插件调用写接口时需携带此令牌。">
          <AppInput
            type="password"
            value={settings.metadataImportToken}
            onChange={(event) => onSettingsChange({ ...settings, metadataImportToken: event.currentTarget.value })}
            placeholder="未配置"
            style={{ width: 260 }}
          />
        </SettingsRow>
        <SettingsRow label="写接口保护" note="启用后非本机 IP 的写操作需令牌验证。">
          <AppSwitch defaultChecked disabled aria-label="写接口保护" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="日志与隐私">
        <SettingsRow label="磁链脱敏" note="日志中不记录完整 magnet 链接。">
          <AppSwitch defaultChecked disabled aria-label="磁链脱敏" />
        </SettingsRow>
        <SettingsRow label="敏感配置隐藏" note="前台不暴露 OpenList token、115 cookie 等配置。">
          <AppSwitch defaultChecked disabled aria-label="敏感配置隐藏" />
        </SettingsRow>
        <SettingsRow label="操作日志" note="记录关键操作：删除、路径修改、导入来源。">
          <AppSwitch disabled aria-label="操作日志" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="局域网访问">
        <SettingsRow label="允许局域网 IP" note="允许同局域网内其他设备访问本服务。">
          <AppSwitch disabled aria-label="局域网访问" />
        </SettingsRow>
      </SettingsGroup>

      <Group justify="flex-end" mt="md">
        {backupMessage && (
          <Text size="sm" c={backupMessage.includes("失败") ? "red.7" : "green.7"}>
            {backupMessage}
          </Text>
        )}
        {saveError && (
          <Text size="sm" c="red.7">
            {saveError}
          </Text>
        )}
        {savedMessage && (
          <Text size="sm" c="green.7">
            {savedMessage}
          </Text>
        )}
        <AppButton loading={isSaving} onClick={onSave}>
          保存安全设置
        </AppButton>
      </Group>
    </>
  );
}

function parseAttachmentFilename(disposition: string) {
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
