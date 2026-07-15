"use client";

import { Box, Group, Stack, Text } from "@mantine/core";
import { Download, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { AppButton, AppInput, AppModal, AppSwitch } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import { defaultRuntimeSettings } from "@/modules/core/settings/defaults";
import type { RuntimeSettings } from "@/modules/core/settings/types";
import type {
  OpenListConnectionCheckResult,
  OpenListConnectionStatus,
  OpenListLoginResult,
} from "@/modules/downloads/providers/openlist";

type SettingsTab = (typeof TABS)[number];
type PublicOpenListLoginResult = Omit<OpenListLoginResult, "token">;

type DataResetSummary = {
  comics: number;
  localFiles: number;
  chapters: number;
  pages: number;
  tags: number;
  readingProgress: number;
  comicSources: number;
  comicResources: number;
  collections: number;
  collectionComics: number;
  scanSessions: number;
  mediaAssets: number;
  cacheEntries: number;
  downloadTasks: number;
  cloudScanSessions: number;
  operationLogs: number;
  settings: number;
  mangaRoots: number;
};


const TABS = ["常规设置", "阅读设置", "扫描设置", "下载设置", "安全设置"] as const;

const OPENLIST_STATUS_CONFIG: Record<OpenListConnectionStatus, { label: string; color: string }> = {
  disabled: { label: "未启用", color: "#53606c" },
  invalid_response: { label: "响应异常", color: "#b86b00" },
  missing_settings: { label: "缺少配置", color: "#b86b00" },
  reachable: { label: "连接正常", color: "#00894a" },
  unauthorized: { label: "认证失败", color: "#d93a4e" },
  unreachable: { label: "不可达", color: "#d93a4e" },
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useAdminTabState<SettingsTab>("activeSettingsTab", "常规设置");
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(defaultRuntimeSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isCheckingOpenList, setIsCheckingOpenList] = useState(false);
  const [openListCheckResult, setOpenListCheckResult] = useState<OpenListConnectionCheckResult | null>(null);
  const [aria2CheckResult, setAria2CheckResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isCheckingAria2, setIsCheckingAria2] = useState(false);
  const [openListLoginUsername, setOpenListLoginUsername] = useState(() => localStorage.getItem("openlist_login_username") ?? "");
  const [openListLoginPassword, setOpenListLoginPassword] = useState(() => localStorage.getItem("openlist_login_password") ?? "");
  const [openListLoginOtp, setOpenListLoginOtp] = useState(() => localStorage.getItem("openlist_login_otp") ?? "");
  const [savedBaselineJson, setSavedBaselineJson] = useState("");

  function updateDirtyBaseline(settings: RuntimeSettings) {
    setSavedBaselineJson(JSON.stringify(settings));
  }

  const isDirty = savedBaselineJson.length > 0 && savedBaselineJson !== JSON.stringify(runtimeSettings);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/settings")
      .then((response) => response.json())
      .then((payload: { settings?: RuntimeSettings }) => {
        if (isMounted && payload.settings) {
      const loaded: RuntimeSettings = {
        ...payload.settings,
        openlistBaseUrl: payload.settings.openlistBaseUrl.trim() && !/^https?:\/\//i.test(payload.settings.openlistBaseUrl.trim())
          ? `http://${payload.settings.openlistBaseUrl.trim()}`
          : payload.settings.openlistBaseUrl.trim(),
        aria2RpcUrl: payload.settings.aria2RpcUrl.trim() && !/^https?:\/\//i.test(payload.settings.aria2RpcUrl.trim())
          ? `http://${payload.settings.aria2RpcUrl.trim()}`
          : payload.settings.aria2RpcUrl.trim(),
      };
      setRuntimeSettings(loaded);
      updateDirtyBaseline(loaded);
      // 服务端已存账号时优先使用，便于 token 过期自动登录；否则回退 localStorage。
      setOpenListLoginUsername(loaded.openlistUsername?.trim() || localStorage.getItem("openlist_login_username") || "");
      setOpenListLoginPassword(loaded.openlistPassword || localStorage.getItem("openlist_login_password") || "");
      setOpenListLoginOtp(localStorage.getItem("openlist_login_otp") || "");
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("openlist_login_username", openListLoginUsername);
  }, [openListLoginUsername]);
  useEffect(() => {
    localStorage.setItem("openlist_login_password", openListLoginPassword);
  }, [openListLoginPassword]);
  useEffect(() => {
    localStorage.setItem("openlist_login_otp", openListLoginOtp);
  }, [openListLoginOtp]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  async function saveSettings() {
    setIsSaving(true);

    try {
      const settingsToSave = {
        ...runtimeSettings,
        openlistBaseUrl: runtimeSettings.openlistBaseUrl.trim() && !/^https?:\/\//i.test(runtimeSettings.openlistBaseUrl.trim())
          ? `http://${runtimeSettings.openlistBaseUrl.trim()}`
          : runtimeSettings.openlistBaseUrl.trim(),
        aria2RpcUrl: runtimeSettings.aria2RpcUrl.trim() && !/^https?:\/\//i.test(runtimeSettings.aria2RpcUrl.trim())
          ? `http://${runtimeSettings.aria2RpcUrl.trim()}`
          : runtimeSettings.aria2RpcUrl.trim(),
        // 账号密码随设置一并保存，供下载任务 token 过期时自动重登
        openlistUsername: openListLoginUsername.trim(),
        openlistPassword: openListLoginPassword,
      };
      const response = await fetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsToSave),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { settings?: RuntimeSettings; error?: string };

      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? "设置保存失败。");
      }

      const saved: RuntimeSettings = {
        ...payload.settings,
        openlistBaseUrl: payload.settings.openlistBaseUrl.trim() && !/^https?:\/\//i.test(payload.settings.openlistBaseUrl.trim())
          ? `http://${payload.settings.openlistBaseUrl.trim()}`
          : payload.settings.openlistBaseUrl.trim(),
        aria2RpcUrl: payload.settings.aria2RpcUrl.trim() && !/^https?:\/\//i.test(payload.settings.aria2RpcUrl.trim())
          ? `http://${payload.settings.aria2RpcUrl.trim()}`
          : payload.settings.aria2RpcUrl.trim(),
      };
      setRuntimeSettings(saved);
      updateDirtyBaseline(saved);
      toast.success("设置已保存");
    } catch (error) {
      console.error("设置保存失败", error);
      toast.error(error instanceof Error ? error.message : "设置保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSettingsWith(settings: RuntimeSettings, options?: { silent?: boolean }) {
    setIsSaving(true);
    try {
      const settingsToSave = {
        ...settings,
        openlistBaseUrl: settings.openlistBaseUrl.trim() && !/^https?:\/\//i.test(settings.openlistBaseUrl.trim())
          ? `http://${settings.openlistBaseUrl.trim()}`
          : settings.openlistBaseUrl.trim(),
        aria2RpcUrl: settings.aria2RpcUrl.trim() && !/^https?:\/\//i.test(settings.aria2RpcUrl.trim())
          ? `http://${settings.aria2RpcUrl.trim()}`
          : settings.aria2RpcUrl.trim(),
      };
      const response = await fetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsToSave),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { settings?: RuntimeSettings; error?: string };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? "设置保存失败。");
      }
      const saved: RuntimeSettings = {
        ...payload.settings,
        openlistBaseUrl: payload.settings.openlistBaseUrl.trim() && !/^https?:\/\//i.test(payload.settings.openlistBaseUrl.trim())
          ? `http://${payload.settings.openlistBaseUrl.trim()}`
          : payload.settings.openlistBaseUrl.trim(),
        aria2RpcUrl: payload.settings.aria2RpcUrl.trim() && !/^https?:\/\//i.test(payload.settings.aria2RpcUrl.trim())
          ? `http://${payload.settings.aria2RpcUrl.trim()}`
          : payload.settings.aria2RpcUrl.trim(),
      };
      setRuntimeSettings(saved);
      updateDirtyBaseline(saved);
      if (!options?.silent) {
        toast.success("设置已保存");
      }
    } catch (error) {
      console.error("设置保存失败", error);
      toast.error(error instanceof Error ? error.message : "设置保存失败。");
      throw error;
    } finally {
      setIsSaving(false);
    }
  }

  async function exportSqliteBackup() {
    setIsExportingBackup(true);

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
      toast.success("备份已开始下载");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SQLite 备份导出失败。");
    } finally {
      setIsExportingBackup(false);
    }
  }

  function showOpenListCheckToast(result: Pick<OpenListConnectionCheckResult, "ok" | "message">) {
    if (result.ok) {
      toast.success(result.message || "OpenList 连接正常，设置已保存");
    } else {
      toast.error(result.message || "OpenList 校验失败。");
    }
  }

  async function checkOpenListConnection() {
    setIsCheckingOpenList(true);
    setOpenListCheckResult(null);

    try {
      const rawUrl = runtimeSettings.openlistBaseUrl.trim();
      const baseUrl = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `http://${rawUrl}` : rawUrl;

      if (!baseUrl) {
        const result: OpenListConnectionCheckResult = {
          ok: false, status: "missing_settings", checkedAt: new Date().toISOString(),
          baseUrl: null, tokenConfigured: false,
          message: "请先填写 OpenList 服务地址。", publicApi: null, accountApi: null,
        };
        setOpenListCheckResult(result);
        showOpenListCheckToast(result);
        return;
      }

      const token = runtimeSettings.openlistToken.trim();
      const hasLogin = Boolean(openListLoginUsername.trim() && openListLoginPassword.trim());

      // Explicit login credentials take precedence over any existing token.
      // This makes the button behavior predictable when the user wants to refresh authentication.
      if (hasLogin) {
        const loginRes = await fetch("/api/settings/openlist/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl,
            enabled: runtimeSettings.openlistEnabled,
            username: openListLoginUsername,
            password: openListLoginPassword,
            otpCode: openListLoginOtp || null,
          }),
        });
        const loginPayload = (await loginRes.json()) as { result?: PublicOpenListLoginResult; settings?: RuntimeSettings; error?: string };

        if (!loginPayload.result?.ok || !loginPayload.settings) {
          const ls = loginPayload.result?.status;
          const ms: OpenListConnectionStatus = ls === "missing_settings" ? "missing_settings" : ls === "unauthorized" ? "unauthorized" : ls === "invalid_response" ? "invalid_response" : "unreachable";
          const result: OpenListConnectionCheckResult = {
            ok: false, status: ms, checkedAt: new Date().toISOString(),
            baseUrl, tokenConfigured: false,
            message: loginPayload.result?.message ?? loginPayload.error ?? "登录失败。", publicApi: null, accountApi: null,
          };
          setOpenListCheckResult(result);
          showOpenListCheckToast(result);
          return;
        }

        const s = loginPayload.settings;
        const loginUpdated: RuntimeSettings = {
          ...runtimeSettings,
          openlistBaseUrl: s.openlistBaseUrl.trim() && !/^https?:\/\//i.test(s.openlistBaseUrl.trim())
            ? `http://${s.openlistBaseUrl.trim()}`
            : s.openlistBaseUrl.trim(),
          openlistToken: s.openlistToken.trim(),
          openlistUsername: openListLoginUsername.trim(),
          openlistPassword: openListLoginPassword,
        };

        const retryRes = await fetch("/api/settings/openlist/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: loginUpdated.openlistBaseUrl,
            token: loginUpdated.openlistToken,
            enabled: loginUpdated.openlistEnabled,
          }),
        });
        const retryPayload = (await retryRes.json()) as { result?: OpenListConnectionCheckResult; error?: string };

        if (!retryPayload.result) {
          throw new Error(retryPayload.error ?? "登录成功但校验失败。");
        }

        setOpenListCheckResult(retryPayload.result);
        if (retryPayload.result.ok) {
          await saveSettingsWith(loginUpdated, { silent: true });
          toast.success(retryPayload.result.message || "OpenList 登录成功，设置已保存");
        } else {
          showOpenListCheckToast(retryPayload.result);
        }
        return;
      }

      if (token) {
        const checkRes = await fetch("/api/settings/openlist/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl, token, enabled: runtimeSettings.openlistEnabled }),
        });
        const checkPayload = (await checkRes.json()) as { result?: OpenListConnectionCheckResult; error?: string };

        if (!checkPayload.result) {
          throw new Error(checkPayload.error ?? "校验失败。");
        }

        setOpenListCheckResult(checkPayload.result);
        if (checkPayload.result.ok) {
          await saveSettingsWith({
            ...runtimeSettings,
            openlistBaseUrl: baseUrl,
            openlistUsername: openListLoginUsername.trim(),
            openlistPassword: openListLoginPassword,
          }, { silent: true });
          toast.success(checkPayload.result.message || "OpenList 连接正常，设置已保存");
        } else {
          showOpenListCheckToast(checkPayload.result);
        }
        return;
      }

      const result: OpenListConnectionCheckResult = {
        ok: false, status: "missing_settings", checkedAt: new Date().toISOString(),
        baseUrl, tokenConfigured: false,
        message: "请填写访问 token 或通过账号登录获取。", publicApi: null, accountApi: null,
      };
      setOpenListCheckResult(result);
      showOpenListCheckToast(result);
    } catch (error) {
      const result: OpenListConnectionCheckResult = {
        ok: false, status: "unreachable", checkedAt: new Date().toISOString(),
        baseUrl: runtimeSettings.openlistBaseUrl.trim() || null,
        tokenConfigured: Boolean(runtimeSettings.openlistToken.trim()),
        message: error instanceof Error ? error.message : "校验失败。", publicApi: null, accountApi: null,
      };
      setOpenListCheckResult(result);
      showOpenListCheckToast(result);
    } finally {
      setIsCheckingOpenList(false);
    }
  }

  async function checkAria2Connection() {
    setIsCheckingAria2(true);
    setAria2CheckResult(null);

    try {
      const response = await fetch("/api/settings/aria2/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rpcUrl: runtimeSettings.aria2RpcUrl && !/^https?:\/\//i.test(runtimeSettings.aria2RpcUrl) ? `http://${runtimeSettings.aria2RpcUrl}` : runtimeSettings.aria2RpcUrl,
          rpcToken: runtimeSettings.aria2RpcToken,
        }),
      });
      const payload = (await response.json()) as { result?: { ok: boolean; message: string }; error?: string };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "aria2 连接校验失败。");
      }

      setAria2CheckResult(payload.result);
      if (payload.result.ok) {
        await saveSettingsWith(runtimeSettings, { silent: true });
        toast.success(payload.result.message || "aria2 连接正常，设置已保存");
      } else {
        toast.error(payload.result.message || "aria2 连接校验失败。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "aria2 连接校验失败。";
      setAria2CheckResult({ ok: false, message });
      toast.error(message);
    } finally {
      setIsCheckingAria2(false);
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
            onClick={() => {
              if (isDirty && !window.confirm("有未保存的更改，离开后将丢失。确定要切换吗？")) return;
              setActiveTab(tab);
            }}
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
            onSettingsChange={setRuntimeSettings}
            settings={runtimeSettings}
          />
        )}
        {activeTab === "阅读设置" && (
          <ReaderSettings
            onSettingsChange={setRuntimeSettings}
            settings={runtimeSettings}
          />
        )}
        {activeTab === "扫描设置" && <ScanSettings />}
        {activeTab === "下载设置" && (
          <DownloadSettings
            aria2CheckResult={aria2CheckResult}
            checkResult={openListCheckResult}
            isCheckingAria2={isCheckingAria2}
            isCheckingOpenList={isCheckingOpenList}
            loginOtp={openListLoginOtp}
            loginPassword={openListLoginPassword}
            loginUsername={openListLoginUsername}
            onCheckAria2={checkAria2Connection}
            onCheckOpenList={checkOpenListConnection}
            onSetLoginOtp={setOpenListLoginOtp}
            onSetLoginPassword={setOpenListLoginPassword}
            onSetLoginUsername={setOpenListLoginUsername}
            onSettingsChange={setRuntimeSettings}
            settings={runtimeSettings}
          />
        )}
        {activeTab === "安全设置" && (
          <SecuritySettings
            isExportingBackup={isExportingBackup}
            onExportBackup={exportSqliteBackup}
            onSettingsChange={setRuntimeSettings}
            settings={runtimeSettings}
          />
        )}
      </Box>

      <Box style={{
        position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 999,
        display: "flex", alignItems: "center", gap: 14,
        padding: "12px 24px",
        borderRadius: 12,
        background: isDirty ? "#fff4f8" : "#f4fffa",
        boxShadow: isDirty
          ? "0 4px 20px rgba(239,59,145,0.15), 0 0 0 1px var(--mantine-color-pink-3)"
          : "0 2px 12px rgba(0,0,0,0.06), 0 0 0 1px var(--mantine-color-green-2)",
        transition: "all 200ms ease",
      }}>
        <Box
          component="span"
          style={{
            width: 8, height: 8, borderRadius: "50%",
            backgroundColor: isDirty ? "#d93a4e" : "#00894a",
            flexShrink: 0,
          }}
        />
        <Text size="xs" fw={600} c={isDirty ? "pink.6" : "green.7"}>
          {isDirty ? "有未保存的更改" : "设置已保存"}
        </Text>
        <AppButton loading={isSaving} onClick={saveSettings} size="xs" variant={isDirty ? "filled" : "outline"} styles={{ root: isDirty ? {} : { borderColor: "var(--mantine-color-green-4)", color: "var(--mantine-color-green-7)" } }}>
          {isDirty ? "保存设置" : "重新保存"}
        </AppButton>
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

function ReadonlyValue({ value, tone = "neutral" }: { value: string; tone?: "neutral" | "on" | "off" }) {
  const colors = {
    neutral: { background: "white", color: "var(--mantine-color-ink-7)" },
    off: { background: "#f1f3f5", color: "#53606c" },
    on: { background: "#e4f9ed", color: "#00894a" },
  }[tone];

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 32,
        minWidth: 120,
        padding: "0 10px",
        border: "1px solid var(--mantine-color-pink-2)",
        borderRadius: 7,
        background: colors.background,
        color: colors.color,
        fontSize: 13,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </Box>
  );
}

function GeneralSettings({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (settings: RuntimeSettings) => void;
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
          <ReadonlyValue value="关闭" tone="off" />
        </SettingsRow>
        <SettingsRow label="定时扫描" note="按 cron 表达式定时扫描目录变更。">
          <AppInput value="未启用" readOnly style={{ width: 180 }} />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

function ReaderSettings({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (settings: RuntimeSettings) => void;
  settings: RuntimeSettings;
}) {
  return (
    <>
      <SettingsGroup title="阅读行为">
        <SettingsRow label="默认阅读模式" note="打开漫画后的阅读方式。">
          <ReadonlyValue value="滚动模式" tone="on" />
        </SettingsRow>
        <SettingsRow label="图片预加载" note="提前加载后续页面图片以减少等待。">
          <AppSwitch
            checked={settings.readerPreloadEnabled}
            onChange={(event) => onSettingsChange({ ...settings, readerPreloadEnabled: event.currentTarget.checked })}
            aria-label="图片预加载"
          />
        </SettingsRow>
        <SettingsRow label="阅读进度记录" note="自动记录每本漫画的阅读位置。">
          <ReadonlyValue value="已启用" tone="on" />
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
    </>
  );
}

function DownloadSettings({
  aria2CheckResult,
  checkResult,
  isCheckingAria2,
  isCheckingOpenList,
  loginOtp,
  loginPassword,
  loginUsername,
  onCheckAria2,
  onCheckOpenList,
  onSetLoginOtp,
  onSetLoginPassword,
  onSetLoginUsername,
  onSettingsChange,
  settings,
}: {
  aria2CheckResult: { ok: boolean; message: string } | null;
  checkResult: OpenListConnectionCheckResult | null;
  isCheckingAria2: boolean;
  isCheckingOpenList: boolean;
  loginOtp: string;
  loginPassword: string;
  loginUsername: string;
  onCheckAria2: () => void;
  onCheckOpenList: () => void;
  onSetLoginOtp: (value: string) => void;
  onSetLoginPassword: (value: string) => void;
  onSetLoginUsername: (value: string) => void;
  onSettingsChange: (settings: RuntimeSettings) => void;
  settings: RuntimeSettings;
}) {
  const openListStatus = checkResult?.status;
  const openListDotColor = openListStatus
    ? OPENLIST_STATUS_CONFIG[openListStatus]?.color ?? "#53606c"
    : undefined;

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
          <Group gap="xs" wrap="nowrap" align="center">
            {isCheckingOpenList ? (
              <Text size="xs" c="blue">校验中…</Text>
            ) : checkResult ? (
              <Box component="span" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: openListDotColor ?? "#53606c" }} />
            ) : null}
            <AppInput
              value={settings.openlistBaseUrl}
              onChange={(event) => onSettingsChange({ ...settings, openlistBaseUrl: event.currentTarget.value })}
              placeholder="http://127.0.0.1:5244"
              style={{ width: 280 }}
            />
          </Group>
        </SettingsRow>
        <SettingsRow label="访问 token" note="直接填入已有的 token，或通过下方账号登录自动获取。">
          <Group gap="xs" wrap="nowrap" align="center">
            {settings.openlistToken.trim() ? (
              <Box component="span" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: "#00894a" }} />
            ) : null}
            <AppInput
              type="password"
              value={settings.openlistToken}
              onChange={(event) => onSettingsChange({ ...settings, openlistToken: event.currentTarget.value })}
              placeholder="未配置"
              style={{ width: 280 }}
            />
          </Group>
        </SettingsRow>
        <SettingsRow label="账号登录" note="用户名/密码会保存到本地服务端，token 过期时下载任务可自动重登刷新。OTP 不会用于自动登录。">
          <Stack gap={8} style={{ width: 320 }}>
            <AppInput value={loginUsername} onChange={(event) => onSetLoginUsername(event.currentTarget.value)} placeholder="用户名" size="xs" />
            <AppInput
              type="password"
              value={loginPassword}
              onChange={(event) => onSetLoginPassword(event.currentTarget.value)}
              placeholder="密码"
              size="xs"
            />
            <AppInput value={loginOtp} onChange={(event) => onSetLoginOtp(event.currentTarget.value)} placeholder="OTP，可选" size="xs" />
          </Stack>
        </SettingsRow>
        <SettingsRow label="校验并保存" note={checkResult && checkResult.ok ? "最近一次校验成功" : "填写账号密码时优先登录并保存凭证；结果以右上角 toast 提示。"}>
          <AppButton loading={isCheckingOpenList} onClick={onCheckOpenList}>
            校验并保存
          </AppButton>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="aria2">
        <SettingsRow label="启用 aria2" note="启用 aria2 provider 用于磁链和 torrent 资源下载。">
          <AppSwitch
            checked={settings.aria2Enabled}
            onChange={(event) => onSettingsChange({ ...settings, aria2Enabled: event.currentTarget.checked })}
            aria-label="启用 aria2"
          />
        </SettingsRow>
        <SettingsRow label="aria2 RPC 地址" note="aria2 JSON-RPC 端点，例如 http://127.0.0.1:6800/jsonrpc。">
          <Group gap="xs" wrap="nowrap" align="center">
            {isCheckingAria2 ? (
              <Text size="xs" c="blue">校验中…</Text>
            ) : aria2CheckResult ? (
              <Box component="span" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: aria2CheckResult.ok ? "#00894a" : "#d93a4e" }} />
            ) : null}
            <AppInput
              value={settings.aria2RpcUrl}
              onChange={(event) => onSettingsChange({ ...settings, aria2RpcUrl: event.currentTarget.value })}
              placeholder="http://127.0.0.1:6800/jsonrpc"
              style={{ width: 280 }}
            />
          </Group>
        </SettingsRow>
        <SettingsRow label="aria2 RPC 密钥" note="--rpc-secret 设置的密钥，留空表示无密钥。">
          <AppInput
            value={settings.aria2RpcToken}
            onChange={(event) => onSettingsChange({ ...settings, aria2RpcToken: event.currentTarget.value })}
            placeholder="未配置"
            style={{ width: 320 }}
          />
        </SettingsRow>
        <SettingsRow label="连接校验" note="通过 RPC 接口检查 aria2 连通性；结果以右上角 toast 提示。">
          <AppButton loading={isCheckingAria2} onClick={onCheckAria2}>
            校验连接
          </AppButton>
        </SettingsRow>
      </SettingsGroup>

    </>
  );
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
          <ReadonlyValue value="cover.* 优先" tone="on" />
        </SettingsRow>
        <SettingsRow label="扫描后生成缩略图" note="扫描完成后自动生成缩略图缓存。">
          <ReadonlyValue value="懒生成" tone="neutral" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="文件校验">
        <SettingsRow label="计算文件 hash" note="扫描时计算 SHA-256 用于重复检测和路径修复。">
          <ReadonlyValue value="未启用" tone="off" />
        </SettingsRow>
        <SettingsRow label="自动修复路径" note="检测到文件移动后自动更新数据库路径。">
          <ReadonlyValue value="手动修复" tone="neutral" />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

function SecuritySettings({
  isExportingBackup,
  onExportBackup,
  onSettingsChange,
  settings,
}: {
  isExportingBackup: boolean;
  onExportBackup: () => void;
  onSettingsChange: (settings: RuntimeSettings) => void;
  settings: RuntimeSettings;
}) {
  type ClearScope = "cache" | "library" | "downloads";

  const CLEAR_SCOPE_META: Record<
    ClearScope,
    {
      title: string;
      description: string;
      confirmMessage: string;
      successLabel: string;
    }
  > = {
    cache: {
      title: "清空缓存",
      description: "封面、缩略图、压缩包文件列表等生成缓存。",
      confirmMessage: "确定清空缓存吗？不会删除漫画原文件，也不会改动设置与漫画根目录。",
      successLabel: "缓存",
    },
    library: {
      title: "清空漫画信息",
      description: "漫画、章节、页面、标签、阅读进度、收藏、扫描记录与来源元数据。会连带清理依赖的缓存记录。",
      confirmMessage: "确定清空漫画信息吗？会删除库内记录（含依赖缓存），但不会删除磁盘上的漫画原文件，也不会改动设置与漫画根目录。",
      successLabel: "漫画信息",
    },
    downloads: {
      title: "清空下载任务",
      description: "下载任务及其准备/传输/落盘记录，以及云扫描会话。",
      confirmMessage: "确定清空下载任务吗？不会删除已下载到磁盘的漫画文件，也不会改动设置与漫画根目录。",
      successLabel: "下载任务",
    },
  };

  const [summary, setSummary] = useState<DataResetSummary | null>(null);
  const [pendingScope, setPendingScope] = useState<ClearScope | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  async function loadSummary() {
    setIsLoadingSummary(true);
    try {
      const response = await fetch("/api/settings/data-reset");
      const payload = (await response.json().catch(() => ({}))) as { summary?: DataResetSummary; error?: string };
      if (!response.ok || !payload.summary) {
        throw new Error(payload.error ?? "读取数据摘要失败。");
      }
      setSummary(payload.summary);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取数据摘要失败。");
    } finally {
      setIsLoadingSummary(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  async function executeReset(scope: ClearScope) {
    setIsResetting(true);
    try {
      const response = await fetch("/api/settings/data-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clearCache: scope === "cache",
          clearLibrary: scope === "library",
          clearDownloads: scope === "downloads",
          confirm: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: {
          deleted?: {
            comics?: number;
            downloadTasks?: number;
            mediaAssets?: number;
            cacheEntries?: number;
          };
        };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "清空数据失败。");
      }

      const deleted = payload.result?.deleted;
      const meta = CLEAR_SCOPE_META[scope];
      if (scope === "cache") {
        toast.success(`已清空${meta.successLabel}：媒体 ${deleted?.mediaAssets ?? 0}，压缩包列表 ${deleted?.cacheEntries ?? 0}。`);
      } else if (scope === "library") {
        toast.success(`已清空${meta.successLabel}：漫画 ${deleted?.comics ?? 0} 条记录。设置与漫画根目录已保留。`);
      } else {
        toast.success(`已清空${meta.successLabel}：${deleted?.downloadTasks ?? 0} 个任务。`);
      }

      setPendingScope(null);
      await loadSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清空数据失败。");
    } finally {
      setIsResetting(false);
    }
  }

  function scopeCount(scope: ClearScope) {
    if (!summary) return null;
    if (scope === "cache") return summary.mediaAssets + summary.cacheEntries;
    if (scope === "library") return summary.comics;
    return summary.downloadTasks;
  }

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

      <SettingsGroup title="数据清理">
        <SettingsRow
          label="当前数据量"
          note="清空不会删除磁盘上的漫画原文件，也不会改动设置与漫画根目录。"
        >
          <AppButton variant="outline" loading={isLoadingSummary} onClick={() => void loadSummary()}>
            刷新摘要
          </AppButton>
        </SettingsRow>
        {summary ? (
          <Box
            mb="md"
            p="md"
            style={{
              borderRadius: 12,
              border: "1px solid #fde6ef",
              background: "#fffafc",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            <SummaryStat label="漫画" value={summary.comics} />
            <SummaryStat label="本地文件记录" value={summary.localFiles} />
            <SummaryStat label="下载任务" value={summary.downloadTasks} />
            <SummaryStat label="媒体缓存" value={summary.mediaAssets} />
            <SummaryStat label="压缩包缓存" value={summary.cacheEntries} />
            <SummaryStat label="设置项" value={summary.settings} />
            <SummaryStat label="漫画根目录" value={summary.mangaRoots} />
          </Box>
        ) : null}

        {(["cache", "library", "downloads"] as const).map((scope) => {
          const meta = CLEAR_SCOPE_META[scope];
          const count = scopeCount(scope);
          const note = count === null ? meta.description : `${meta.description} 当前约 ${count} 项。`;
          return (
            <SettingsRow key={scope} label={meta.title} note={note}>
              <AppButton
                color="red"
                variant="outline"
                leftSection={<Trash2 size={15} />}
                disabled={isResetting}
                onClick={() => setPendingScope(scope)}
              >
                清空
              </AppButton>
            </SettingsRow>
          );
        })}

        <SettingsRow label="保留范围" note="设置、OpenList/aria2 配置、漫画根目录路径始终保留。">
          <ReadonlyValue value="设置 + 根目录" tone="on" />
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
          <ReadonlyValue value="已启用" tone="on" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="日志与隐私">
        <SettingsRow label="磁链脱敏" note="日志中不记录完整 magnet 链接。">
          <ReadonlyValue value="已启用" tone="on" />
        </SettingsRow>
        <SettingsRow label="敏感配置隐藏" note="前台不暴露 OpenList token、115 cookie 等配置。">
          <ReadonlyValue value="已启用" tone="on" />
        </SettingsRow>
        <SettingsRow label="操作日志" note="记录关键操作：删除、路径修改、导入来源。">
          <ReadonlyValue value="已启用" tone="on" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="局域网访问">
        <SettingsRow label="允许局域网 IP" note="允许同局域网内其他设备访问本服务。">
          <ReadonlyValue value="未启用" tone="off" />
        </SettingsRow>
      </SettingsGroup>

      <AppModal
        opened={pendingScope !== null}
        onClose={() => !isResetting && setPendingScope(null)}
        title={pendingScope ? `确认${CLEAR_SCOPE_META[pendingScope].title}` : "确认清空"}
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" c="ink.6">
            {pendingScope ? CLEAR_SCOPE_META[pendingScope].confirmMessage : ""}
          </Text>
          <Group justify="flex-end" gap="sm">
            <AppButton variant="outline" disabled={isResetting} onClick={() => setPendingScope(null)}>
              取消
            </AppButton>
            <AppButton
              color="red"
              loading={isResetting}
              disabled={!pendingScope}
              onClick={() => {
                if (pendingScope) void executeReset(pendingScope);
              }}
            >
              确定
            </AppButton>
          </Group>
        </Stack>
      </AppModal>
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <Box>
      <Text size="xs" c="ink.5" mb={2}>
        {label}
      </Text>
      <Text size="sm" fw={800}>
        {value}
      </Text>
    </Box>
  );
}

function parseAttachmentFilename(disposition: string) {
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? null;
}
