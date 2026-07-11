"use client";

import { ActionIcon, Box, Group, ScrollArea, Text, Tooltip } from "@mantine/core";
import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminTabs } from "./admin-tab-provider";
import { DEFAULT_ADMIN_TAB_ID } from "./admin-tab-types";

export function AdminTabStrip() {
  const { activeTabId, tabs, activateTab, closeTab, closeOtherTabs, closeTabsToRight, refreshActiveTab } = useAdminTabs();
  const [ctxTabId, setCtxTabId] = useState<string | null>(null);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openCtx = useCallback((tabId: string, x: number, y: number) => {
    setCtxTabId(tabId);
    setCtxPos({ x, y });
  }, []);

  const closeCtx = useCallback(() => {
    setCtxTabId(null);
    setCtxPos(null);
  }, []);

  useEffect(() => {
    if (!ctxPos) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeCtx();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctxPos, closeCtx]);

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
            const canClose = tabs.length > 1 || tab.id !== DEFAULT_ADMIN_TAB_ID;

            return (
              <Box
                key={tab.id}
                component="button"
                type="button"
                onClick={() => activateTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openCtx(tab.id, e.clientX, e.clientY);
                }}
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
                {canClose ? (
                  <Box
                    component="span"
                    aria-label={`关闭 ${tab.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      cursor: "pointer",
                      color: "var(--mantine-color-pink-5)",
                      fontSize: 13,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    <X size={13} />
                  </Box>
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

      {/* Context Menu */}
      {ctxPos && ctxTabId && (
        <Box
          ref={menuRef}
          style={{
            position: "fixed",
            top: ctxPos.y,
            left: ctxPos.x,
            zIndex: 9999,
            minWidth: 160,
            background: "white",
            border: "1px solid var(--mantine-color-pink-1)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "4px 0",
          }}
        >
          <CtxItem onClick={() => { closeTab(ctxTabId); closeCtx(); }}>
            关闭此页签
          </CtxItem>
          <CtxItem onClick={() => { closeOtherTabs(ctxTabId); closeCtx(); }}>
            关闭其他页签
          </CtxItem>
          <CtxItem onClick={() => { closeTabsToRight(ctxTabId); closeCtx(); }}>
            关闭右侧页签
          </CtxItem>
          <CtxItem onClick={() => { closeCtx(); }}>
            取消
          </CtxItem>
        </Box>
      )}
    </Box>
  );
}

function CtxItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 16px",
        border: "none",
        background: "transparent",
        color: "var(--mantine-color-ink-7)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <Text size="sm" fw={600}>{children}</Text>
    </Box>
  );
}
