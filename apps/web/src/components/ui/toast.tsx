"use client";

import { Box, Text } from "@mantine/core";
import { useEffect, useState } from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  tone?: ToastTone;
  /** 毫秒；默认 success/info 4s，error 8s */
  duration?: number;
}

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  duration: number;
}

type ToastListener = (items: ToastItem[]) => void;

const listeners = new Set<ToastListener>();
let items: ToastItem[] = [];
let seq = 0;

function emit() {
  const snapshot = [...items];
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function dismiss(id: string) {
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) {
    return;
  }
  items = next;
  emit();
}

function defaultDuration(tone: ToastTone) {
  return tone === "error" ? 8000 : 4000;
}

function pushToast(message: string, options: ToastOptions = {}) {
  const text = message.trim();
  if (!text) {
    return "";
  }

  const tone = options.tone ?? "info";
  const duration = options.duration ?? defaultDuration(tone);
  const id = `toast-${++seq}-${Date.now()}`;
  items = [...items, { id, message: text, tone, duration }].slice(-5);
  emit();

  window.setTimeout(() => dismiss(id), duration);
  return id;
}

/** 全局临时提示。任务列表错误等持久状态不要用 toast。 */
export const toast = Object.assign(
  (message: string, options?: ToastOptions) => pushToast(message, options),
  {
    success: (message: string, duration?: number) => pushToast(message, { tone: "success", duration }),
    error: (message: string, duration?: number) => pushToast(message, { tone: "error", duration }),
    info: (message: string, duration?: number) => pushToast(message, { tone: "info", duration }),
    dismiss,
  },
);

const TONE_STYLE: Record<ToastTone, { background: string; border: string }> = {
  success: { background: "#087f5b", border: "#066649" },
  error: { background: "#d93a4e", border: "#b82f40" },
  info: { background: "#3b5bdb", border: "#364fc7" },
};

export function Toaster() {
  // 用当前 store 快照初始化，避免在 effect 里同步 setState
  const [toasts, setToasts] = useState<ToastItem[]>(() => [...items]);

  useEffect(() => {
    const listener: ToastListener = (next) => setToasts(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <Box
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: "min(420px, calc(100vw - 32px))",
        pointerEvents: "none",
      }}
    >
      {toasts.map((item) => {
        const style = TONE_STYLE[item.tone];
        return (
          <Box
            key={item.id}
            role="status"
            onClick={() => dismiss(item.id)}
            style={{
              pointerEvents: "auto",
              cursor: "pointer",
              padding: "10px 16px",
              borderRadius: 10,
              background: style.background,
              border: `1px solid ${style.border}`,
              color: "#fff",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              animation: "mangatest-toast-in 160ms ease-out",
            }}
          >
            <Text size="sm" fw={600} style={{ lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {item.message}
            </Text>
          </Box>
        );
      })}
      <style>{`
        @keyframes mangatest-toast-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Box>
  );
}
