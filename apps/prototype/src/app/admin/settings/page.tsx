"use client";

import { useState } from "react";
import { Box, Text } from "@mantine/core";
import { Settings } from "lucide-react";
import { AppButton, AppSelect, AppSwitch } from "@/components/ui/app-components";
import { settingsTabs } from "@/lib/mock-data";

type SettingsTab = (typeof settingsTabs)[number];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("常规设置");

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 22 }}>
        <Settings size={22} />
        <Box>
          <Text component="h1" size="20px" fw={700} mb={4}>系统设置</Text>
          <Text size="sm" c="ink.5">本地自托管配置按用途分组，原型只展示模拟选项。</Text>
        </Box>
      </Box>

      <Box
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18, borderBottom: "1px solid #fde6ef" }}
        role="tablist"
      >
        {settingsTabs.map((tab) => (
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
                padding: "0 16px",
                fontWeight: 900,
                fontSize: 14,
                border: "none",
                borderBottom: activeTab === tab ? "2px solid var(--mantine-color-pink-5)" : "2px solid transparent",
                borderRadius: 0,
                background: "transparent",
                color: activeTab === tab ? "var(--mantine-color-pink-5)" : "#9a6078",
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
          <>
            <SettingSwitch label="自动扫描" note="启动时自动扫描所有漫画路径" defaultChecked />
            <SettingSwitch label="阅读进度记录" note="自动记录每本漫画的阅读进度" defaultChecked />
            <SettingSelect label="默认阅读模式" note="选择打开漫画时的默认阅读方式" defaultValue="滚动模式" options={["滚动模式", "分页模式", "双页模式"]} />
            <SettingSwitch label="图片预加载" note="阅读时提前加载后续页面" />
            <SettingSelect label="每页显示数量" note="漫画列表每页显示的漫画数" defaultValue="20" options={["20", "40", "80"]} />
          </>
        )}

        {activeTab === "阅读设置" && (
          <>
            {["向上滚动 ↑", "向下滚动 ↓", "翻下一屏 Space", "返回详情 Esc", "显示工具栏 Tab"].map((item) => {
              const [title, key] = item.split(" ");
              return (
                <Box
                  key={item}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 18,
                  alignItems: "center",
                  minHeight: 68,
                  padding: "12px 0",
                  borderBottom: "1px solid #fde6ef",
                }}
              >
                <Box>
                  <Text fw={600} size="15px">{title}</Text>
                  <Text size="xs" c="ink.5">点击按键输入框后按下新的快捷键即可修改</Text>
                </Box>
                <Box
                  component="kbd"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 60,
                    minHeight: 36,
                    padding: "0 12px",
                    border: "1px solid var(--mantine-color-pink-2)",
                    borderRadius: 8,
                    background: "white",
                    fontFamily: "var(--mantine-font-family-monospace)",
                    fontWeight: 900,
                  }}
                >
                  {key}
                </Box>
              </Box>
            );
          })}
          </>
        )}

        {activeTab === "扫描设置" && (
          <>
            {["支持格式：zip / cbz / 目录", "忽略目录：__MACOSX, .DS_Store", "封面优先级：cover.* 优先"].map((item) => (
              <SettingText key={item} label={item} />
            ))}
          </>
        )}

        {activeTab === "安全设置" && (
          <>
            {["导入令牌：已隐藏", "写接口保护：开启", "日志脱敏：开启"].map((item) => (
              <SettingText key={item} label={item} />
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}

function SettingSwitch({ label, note, defaultChecked = false }: { label: string; note: string; defaultChecked?: boolean }) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 18,
        alignItems: "center",
        minHeight: 68,
        padding: "12px 0",
        borderBottom: "1px solid #fde6ef",
        cursor: "default",
      }}
    >
      <Box>
        <Text fw={600} size="15px" c="#3a2034">{label}</Text>
        <Text size="xs" c="ink.5">{note}</Text>
      </Box>
      <AppSwitch defaultChecked={defaultChecked} aria-label={label} />
    </Box>
  );
}

function SettingSelect({ label, note, defaultValue, options }: { label: string; note: string; defaultValue: string; options: string[] }) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 18,
        alignItems: "center",
        minHeight: 68,
        padding: "12px 0",
        borderBottom: "1px solid #fde6ef",
      }}
    >
      <Box>
        <Text fw={600} size="15px" c="#3a2034">{label}</Text>
        <Text size="xs" c="ink.5">{note}</Text>
      </Box>
      <AppSelect
        defaultValue={defaultValue}
        data={options.map((o) => ({ value: o, label: o }))}
        aria-label={label}
      />
    </Box>
  );
}

function SettingText({ label }: { label: string }) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 18,
        alignItems: "center",
        minHeight: 68,
        padding: "12px 0",
        borderBottom: "1px solid #fde6ef",
      }}
    >
      <Box>
        <Text fw={600} size="15px">{label}</Text>
        <Text size="xs" c="ink.5">原型配置项，后续接入真实设置存储</Text>
      </Box>
    </Box>
  );
}
