"use client";

import { Text } from "@mantine/core";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppModal } from "@/components/ui/app-modal";
import {
  confirmQueueReducer,
  createConfirmQueueState,
  resolvePendingConfirmations,
  type ConfirmQueueItem,
  type ConfirmQueueState,
} from "@/components/ui/app-confirm-state";
import type { AppTone } from "@/components/admin-ui/types";

export type ConfirmOptions = {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Extract<AppTone, "primary" | "warning" | "danger">;
};

export type Confirm = (options: ConfirmOptions) => Promise<boolean>;

type ConfirmResolver = (result: boolean) => void;

export function AppConfirmDialog({
  request,
  onResolve,
}: {
  request: ConfirmQueueItem<ConfirmOptions>;
  onResolve: (result: boolean) => void;
}) {
  const { options } = request;

  return (
    <AppModal
      opened
      onClose={() => onResolve(false)}
      title={options.title}
      size="sm"
      footer={
        <>
          <AppButton tone="neutral" variant="outline" onClick={() => onResolve(false)}>
            {options.cancelLabel ?? "取消"}
          </AppButton>
          <AppButton tone={options.tone ?? "primary"} onClick={() => onResolve(true)}>
            {options.confirmLabel ?? "确认"}
          </AppButton>
        </>
      }
    >
      <Text size="sm" c="ink.6" style={{ whiteSpace: "pre-wrap" }}>
        {options.message}
      </Text>
    </AppModal>
  );
}

const initialQueue = createConfirmQueueState<ConfirmOptions>();
const AppConfirmContext = createContext<Confirm | null>(null);

export function AppConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, dispatch] = useReducer(confirmQueueReducer<ConfirmOptions>, initialQueue);
  const queueRef = useRef<ConfirmQueueState<ConfirmOptions>>(queue);
  const nextId = useRef(1);
  const resolvers = useRef(new Map<number, ConfirmResolver>());

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const resolveActive = useCallback((result: boolean) => {
    const active = queueRef.current.active;
    if (!active) {
      return;
    }

    const resolver = resolvers.current.get(active.id);
    if (!resolver) {
      return;
    }

    resolvers.current.delete(active.id);
    resolver(result);
    dispatch({ type: "resolve", id: active.id });
  }, []);

  const confirm = useCallback<Confirm>((options) => {
    const id = nextId.current;
    nextId.current += 1;

    return new Promise<boolean>((resolve) => {
      resolvers.current.set(id, resolve);
      dispatch({ type: "enqueue", item: { id, options } });
    });
  }, []);

  useEffect(() => {
    const pendingResolvers = resolvers.current;
    return () => {
      resolvePendingConfirmations(pendingResolvers.values());
      pendingResolvers.clear();
    };
  }, []);

  return (
    <AppConfirmContext.Provider value={confirm}>
      {children}
      {queue.active ? <AppConfirmDialog request={queue.active} onResolve={resolveActive} /> : null}
    </AppConfirmContext.Provider>
  );
}

export function useAppConfirm(): Confirm {
  const confirm = useContext(AppConfirmContext);
  if (!confirm) {
    throw new Error("useAppConfirm must be used inside AppConfirmProvider");
  }

  return confirm;
}
