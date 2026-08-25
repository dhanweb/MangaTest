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
  const [state, dispatch] = useReducer(adminTabStateReducer<T>, { initialValue, storageKey }, createAdminTabState);

  useEffect(() => {
    dispatch({ initialValue, storageKey, type: "load" });
  }, [initialValue, storageKey]);

  useEffect(() => {
    if (state.hydratedStorageKey !== storageKey) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state.value));
    } catch {
      // Persisting tab UI state is best-effort.
    }
  }, [state, storageKey]);

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

  return [state.value, setValue, reset];
}

type AdminTabState<T> = {
  value: T;
  hydratedStorageKey: string | null;
};

type AdminTabStateAction<T> =
  | { initialValue: T; storageKey: string; type: "load" }
  | { nextValue: SetStateAction<T>; type: "set" }
  | { initialValue: T; type: "reset" };

export function createAdminTabState<T>({ initialValue }: { initialValue: T; storageKey: string }) {
  return { value: initialValue, hydratedStorageKey: null } satisfies AdminTabState<T>;
}

function adminTabStateReducer<T>(current: AdminTabState<T>, action: AdminTabStateAction<T>): AdminTabState<T> {
  if (action.type === "set") {
    return {
      ...current,
      value: typeof action.nextValue === "function" ? (action.nextValue as (value: T) => T)(current.value) : action.nextValue,
    };
  }

  if (action.type === "reset") {
    return { ...current, value: action.initialValue };
  }

  return {
    value: readStoredTabState(action.storageKey, action.initialValue),
    hydratedStorageKey: action.storageKey,
  };
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
