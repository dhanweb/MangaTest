"use client";

import { ActionIcon, Box, Text } from "@mantine/core";
import { Folder, Plus, RefreshCcw, X } from "lucide-react";
import { AppButton } from "@/components/ui/app-components";

export default function PathsPage() {
  const paths = [
    { path: "D:\\Comics\\Manga", status: "ok" as const, count: 156 },
    { path: "E:\\Downloads\\Comics", status: "ok" as const, count: 89 },
    { path: "F:\\Backup\\OldComics", status: "missing" as const },
  ];

  return (
    <Box
      p="xl"
      style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}
    >
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 22 }}>
        <Folder size={22} />
        <Box>
          <Text component="h1" size="20px" fw={700} mb={4}>漫画路径设置</Text>
          <Text size="sm" c="ink.5">设置本地漫画文件夹路径，系统将自动扫描这些目录下的漫画文件。</Text>
        </Box>
      </Box>

      <Box component="label" style={{ display: "grid", gap: 8, marginBottom: 22 }} fw={800} c="#8f526e">
        添加新路径
        <Text component="span" size="xs" c="ink.5" fw={400}>每行一个路径，支持本地目录和网络共享路径 (UNC)</Text>
        <Box
          component="textarea"
          placeholder={"D:\\Comics\\Manga\nE:\\Downloads\\Comics\n\\\\NAS\\Comics"}
          style={{
            minHeight: 98,
            resize: "vertical",
            padding: "13px 16px",
            border: "1px solid var(--mantine-color-pink-2)",
            borderRadius: 11,
            background: "#fff8fc",
            font: "inherit",
            lineHeight: 1.6,
          }}
        />
      </Box>

      <Box style={{ display: "flex", justifyContent: "flex-end", marginTop: -26, marginBottom: 18 }}>
        <AppButton leftSection={<Plus size={16} />}>添加</AppButton>
      </Box>

      <Box style={{ display: "grid", gap: 12 }}>
        {paths.map((item) => (
          <Box
            key={item.path}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px 16px",
              alignItems: "center",
              padding: "14px 16px",
              border: "1px solid var(--mantine-color-pink-2)",
              borderRadius: 10,
              background: "#fff8fc",
            }}
          >
            <Box
              component="code"
              style={{
                flex: "1 1 280px",
                overflowWrap: "anywhere",
                fontFamily: "var(--mantine-font-family-monospace)",
                fontSize: 14,
                lineHeight: "22px",
                color: "#201422",
              }}
            >
              {item.path}
            </Box>
            <Box style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
              <Text
                component="span"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 8,
                  fontWeight: 900,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  background: item.status === "ok" ? "#d9f9e6" : "#ffe1e1",
                  color: item.status === "ok" ? "#009b52" : "#ec3c45",
                }}
              >
                {item.status === "ok" ? `已扫描 ${item.count} 本` : "路径不存在"}
              </Text>
              <AppButton variant="light" size="xs" leftSection={<RefreshCcw size={15} />}>
                重新扫描
              </AppButton>
              <ActionIcon
                variant="subtle"
                color="red"
                size={30}
                aria-label={`删除 ${item.path}`}
              >
                <X size={16} />
              </ActionIcon>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
