export type ConfirmQueueItem<T> = {
  id: number;
  options: T;
};

export type ConfirmQueueState<T> = {
  active: ConfirmQueueItem<T> | null;
  queued: readonly ConfirmQueueItem<T>[];
};

export type ConfirmQueueAction<T> =
  | { type: "enqueue"; item: ConfirmQueueItem<T> }
  | { type: "resolve"; id: number };

export function createConfirmQueueState<T>(): ConfirmQueueState<T> {
  return { active: null, queued: [] };
}

export function confirmQueueReducer<T>(state: ConfirmQueueState<T>, action: ConfirmQueueAction<T>): ConfirmQueueState<T> {
  switch (action.type) {
    case "enqueue":
      return state.active ? { ...state, queued: [...state.queued, action.item] } : { active: action.item, queued: state.queued };
    case "resolve": {
      if (!state.active || state.active.id !== action.id) {
        return state;
      }

      const [nextActive, ...remaining] = state.queued;
      return { active: nextActive ?? null, queued: remaining };
    }
  }
}

export function resolvePendingConfirmations(resolvers: Iterable<(result: boolean) => void>, result = false): void {
  for (const resolve of resolvers) {
    resolve(result);
  }
}
