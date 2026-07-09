"use client";

import { ActionIcon, Box, Group, ScrollArea, Text, Tooltip } from "@mantine/core";
import { RefreshCw, X } from "lucide-react";

import { useAdminTabs } from "./admin-tab-provider";

export function AdminTabStrip() {
  const { activeTabId, tabs, activateTab, closeTab, refreshActiveTab } = useAdminTabs();

  return (
    <Box
      data-admin-tab-strip
      style={{
        display: "flex",
        minHeight: 42,
        borderBottom: "1px solid #f8cfe0",
        background: "white",
      }}
    >
      <ScrollArea type="hover" scrollbarSize={6} style={{ flex: 1, minWidth: 0 }}>
        <Group gap={0} wrap="nowrap" style={{ minWidth: "max-content" }}>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;

            return (
              <Box
                key={tab.id}
                component="button"
                type="button"
                onClick={() => activateTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 42,
                  maxWidth: 220,
                  minWidth: 112,
                  padding: "0 8px 0 14px",
                  border: 0,
                  borderRight: "1px solid #fde0eb",
                  borderBottom: active ? "2px solid var(--mantine-color-pink-5)" : "2px solid transparent",
                  background: active ? "var(--mantine-color-pink-0)" : "white",
                  color: active ? "var(--mantine-color-pink-6)" : "#5a3b4e",
                  cursor: "pointer",
                  font: "inherit",
                }}
                aria-current={active ? "page" : undefined}
              >
                <Text size="sm" fw={800} truncate style={{ flex: 1, minWidth: 0 }}>
                  {tab.title}
                </Text>
                {tab.closeable ? (
                  <ActionIcon
                    aria-label={`关闭 ${tab.title}`}
                    color="pink"
                    size="xs"
                    variant="subtle"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <X size={13} />
                  </ActionIcon>
                ) : null}
              </Box>
            );
          })}
        </Group>
      </ScrollArea>
      <Tooltip label="刷新当前页签" withArrow>
        <ActionIcon
          aria-label="刷新当前页签"
          color="pink"
          h={42}
          radius={0}
          variant="subtle"
          w={42}
          onClick={refreshActiveTab}
        >
          <RefreshCw size={16} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}
