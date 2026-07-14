"use client";

import { ActionIcon, Box, Group, ScrollArea, Text, Tooltip } from "@mantine/core";
import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";

import { useAdminTabs } from "./admin-tab-provider";
import { DEFAULT_ADMIN_TAB_ID } from "./admin-tab-types";

export function AdminTabStrip() {
  const {
    activeTabId,
    tabs,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
    refreshActiveTab,
  } = useAdminTabs();
  const [ctxTabId, setCtxTabId] = useState<string | null>(null);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const onlyHomeLeft = tabs.length === 1 && tabs[0]?.id === DEFAULT_ADMIN_TAB_ID;
  const hasNonHomeTabs = tabs.some((tab) => tab.id !== DEFAULT_ADMIN_TAB_ID);

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
            const hovered = !active && hoveredTabId === tab.id;
            // 后台首页：仅当还有其它页签时可关；其它页签：即使只剩自己也可关（关后回首页）
            const canClose =
              tab.id === DEFAULT_ADMIN_TAB_ID
                ? tabs.length > 1
                : tab.closeable !== false;

            return (
              <Box
                key={tab.id}
                component="button"
                type="button"
                onClick={() => activateTab(tab.id)}
                onMouseEnter={() => setHoveredTabId(tab.id)}
                onMouseLeave={() => setHoveredTabId((current) => (current === tab.id ? null : current))}
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
                  background: active
                    ? "var(--mantine-color-pink-0)"
                    : hovered
                      ? "var(--mantine-color-pink-0)"
                      : "white",
                  color: active || hovered ? "var(--mantine-color-pink-6)" : "#5a3b4e",
                  cursor: "pointer",
                  font: "inherit",
                  transition: "background 120ms ease, color 120ms ease",
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
                    className="admin-tab-close"
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
                      transition: "background 120ms ease",
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
            minWidth: 168,
            background: "white",
            border: "1px solid var(--mantine-color-pink-1)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "4px 0",
            overflow: "hidden",
          }}
        >
          <CtxItem
            disabled={ctxTabId === DEFAULT_ADMIN_TAB_ID && onlyHomeLeft}
            onClick={() => {
              if (ctxTabId === DEFAULT_ADMIN_TAB_ID && onlyHomeLeft) {
                toast.info("后台首页是最后一个页签，不能关闭");
                closeCtx();
                return;
              }
              closeTab(ctxTabId);
              closeCtx();
            }}
          >
            关闭此页签
          </CtxItem>
          <CtxItem
            disabled={tabs.length <= 1}
            onClick={() => {
              if (tabs.length <= 1) {
                toast.info("没有其它页签可关闭");
                closeCtx();
                return;
              }
              closeOtherTabs(ctxTabId);
              closeCtx();
            }}
          >
            关闭其他页签
          </CtxItem>
          <CtxItem
            onClick={() => {
              closeTabsToRight(ctxTabId);
              closeCtx();
            }}
          >
            关闭右侧页签
          </CtxItem>
          <CtxItem
            disabled={!hasNonHomeTabs}
            onClick={() => {
              if (!hasNonHomeTabs) {
                toast.info("没有可关闭的页签");
                closeCtx();
                return;
              }
              closeAllTabs();
              closeCtx();
            }}
          >
            关闭所有页签
          </CtxItem>
          <Box style={{ height: 1, margin: "4px 0", background: "var(--mantine-color-pink-1)" }} />
          <CtxItem
            onClick={() => {
              closeCtx();
            }}
          >
            取消
          </CtxItem>
        </Box>
      )}

      <style>{`
        .admin-tab-close:hover {
          background: var(--mantine-color-pink-1) !important;
        }
      `}</style>
    </Box>
  );
}

function CtxItem({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => {
        if (!disabled) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 16px",
        border: "none",
        background: !disabled && hovered ? "var(--mantine-color-pink-0)" : "transparent",
        color: disabled
          ? "var(--mantine-color-ink-3)"
          : hovered
            ? "var(--mantine-color-pink-6)"
            : "var(--mantine-color-ink-7)",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.55 : 1,
        transition: "background 100ms ease, color 100ms ease",
      }}
    >
      <Text size="sm" fw={600} c="inherit">
        {children}
      </Text>
    </Box>
  );
}
