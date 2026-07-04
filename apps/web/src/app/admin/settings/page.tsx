"use client";

import { Box, Group, Stack, Text } from "@mantine/core";
import { Settings } from "lucide-react";
import { useState } from "react";

import { AppButton, AppInput, AppSelect, AppSwitch } from "@/components/ui/app-components";
import { defaultRuntimeSettings } from "@/modules/core/settings";

type SettingsTab = (typeof TABS)[number];

const TABS = ["常规设置", "阅读设置", "扫描设置", "安全设置"] as const;

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("常规设置");

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
        {activeTab === "常规设置" && <GeneralSettings />}
        {activeTab === "阅读设置" && <ReaderSettings />}
        {activeTab === "扫描设置" && <ScanSettings />}
        {activeTab === "安全设置" && <SecuritySettings />}
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

function GeneralSettings() {
  return (
    <>
      <SettingsGroup title="路径配置">
        <SettingsRow label="漫画根目录" note="所有漫画文件的存放根路径，必须是绝对路径。">
          <AppInput value="见漫画路径页" readOnly style={{ width: 280 }} />
        </SettingsRow>
        <SettingsRow label="数据目录" note="系统元数据、封面缓存、缩略图存放位置。">
          <AppInput value={defaultRuntimeSettings.cacheDirectory} readOnly style={{ width: 280 }} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="服务配置">
        <SettingsRow label="监听地址" note="本地服务绑定的 IP 地址。">
          <AppInput value={defaultRuntimeSettings.listenHost} readOnly style={{ width: 280 }} />
        </SettingsRow>
        <SettingsRow label="端口号" note="HTTP 服务端口，修改后需重启。">
          <AppInput value="4317" readOnly style={{ width: 120 }} />
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
        <AppButton disabled>保存常规设置</AppButton>
      </Group>
    </>
  );
}

function ReaderSettings() {
  return (
    <>
      <SettingsGroup title="阅读行为">
        <SettingsRow label="默认阅读模式" note="打开漫画后的阅读方式。">
          <AppSelect value="滚动模式" data={["滚动模式", "分页模式"].map((value) => ({ value, label: value }))} disabled />
        </SettingsRow>
        <SettingsRow label="图片预加载" note="提前加载后续页面图片以减少等待。">
          <AppSwitch defaultChecked disabled aria-label="图片预加载" />
        </SettingsRow>
        <SettingsRow label="阅读进度记录" note="自动记录每本漫画的阅读位置。">
          <AppSwitch defaultChecked disabled aria-label="阅读进度" />
        </SettingsRow>
        <SettingsRow label="预加载距离" note="距离底部多少像素时开始预加载下一章节。">
          <AppInput value="3000" readOnly style={{ width: 120 }} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="快捷键">
        {[
          ["向上滚动", "↑ / W"],
          ["向下滚动", "↓ / S"],
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
        <AppButton disabled>保存阅读设置</AppButton>
      </Group>
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

function SecuritySettings() {
  return (
    <>
      <SettingsGroup title="接口保护">
        <SettingsRow label="导入令牌" note="浏览器插件调用写接口时需携带此令牌。">
          <AppInput value="MVP 未启用" readOnly style={{ width: 260 }} />
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
        <AppButton disabled>保存安全设置</AppButton>
      </Group>
    </>
  );
}
