"use client";

import { useCallback, useEffect, useMemo, useReducer, type Dispatch, type SetStateAction } from "react";

import { useAdminTabPaneId } from "./admin-tab-pane-context";
import { useAdminTabs } from "./admin-tab-provider";
import { ADMIN_TAB_STATE_PREFIX } from "./admin-tab-types";

export function useAdminTabState<T>(stateKey: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { activeTabId } = useAdminTabs();
  const paneTabId = useAdminTabPaneId();
  const tabId = paneTabId ?? activeTabId;
  const storageKey = useMemo(() => `${ADMIN_TAB_STATE_PREFIX}:${encodeURIComponent(tabId)}:${stateKey}`, [stateKey, tabId]);
  const [value, dispatch] = useReducer(adminTabStateReducer<T>, { initialValue, storageKey }, createAdminTabState);

  useEffect(() => {
    dispatch({ initialValue, storageKey, type: "load" });
  }, [initialValue, storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Persisting tab UI state is best-effort.
    }
  }, [storageKey, value]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback((nextValue) => {
    dispatch({ nextValue, type: "set" });
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Persisting tab UI state is best-effort.
    }
    dispatch({ initialValue, type: "reset" });
  }, [initialValue, storageKey]);

  return [value, setValue, reset];
}

type AdminTabStateAction<T> =
  | { initialValue: T; storageKey: string; type: "load" }
  | { nextValue: SetStateAction<T>; type: "set" }
  | { initialValue: T; type: "reset" };

function createAdminTabState<T>({ initialValue, storageKey }: { initialValue: T; storageKey: string }) {
  return readStoredTabState(storageKey, initialValue);
}

function adminTabStateReducer<T>(current: T, action: AdminTabStateAction<T>): T {
  if (action.type === "set") {
    return typeof action.nextValue === "function" ? (action.nextValue as (value: T) => T)(current) : action.nextValue;
  }

  if (action.type === "reset") {
    return action.initialValue;
  }

  return readStoredTabState(action.storageKey, action.initialValue);
}

function readStoredTabState<T>(storageKey: string, initialValue: T) {
  if (typeof window === "undefined") {
    return initialValue;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return initialValue;
    }

    return JSON.parse(raw) as T;
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures; the in-memory state still works.
    }

    return initialValue;
  }
}
