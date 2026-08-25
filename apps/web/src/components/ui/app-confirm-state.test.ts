import { describe, expect, it } from "vitest";

import { confirmQueueReducer, createConfirmQueueState, resolvePendingConfirmations, type ConfirmQueueItem } from "./app-confirm-state";

type Options = { title: string };

const item = (id: number): ConfirmQueueItem<Options> => ({ id, options: { title: `确认 ${id}` } });

describe("app confirmation queue state", () => {
  it("activates the first request and queues subsequent requests", () => {
    let state = createConfirmQueueState<Options>();
    state = confirmQueueReducer(state, { type: "enqueue", item: item(1) });
    state = confirmQueueReducer(state, { type: "enqueue", item: item(2) });

    expect(state.active?.id).toBe(1);
    expect(state.queued.map((request) => request.id)).toEqual([2]);
  });

  it("resolves the head and promotes the next request", () => {
    const state = confirmQueueReducer(
      { active: item(1), queued: [item(2), item(3)] },
      { type: "resolve", id: 1 },
    );

    expect(state.active?.id).toBe(2);
    expect(state.queued.map((request) => request.id)).toEqual([3]);
  });

  it("ignores stale or duplicate resolutions", () => {
    const state = { active: item(1), queued: [item(2)] };
    expect(confirmQueueReducer(state, { type: "resolve", id: 2 })).toBe(state);

    const resolved = confirmQueueReducer(state, { type: "resolve", id: 1 });
    expect(confirmQueueReducer(resolved, { type: "resolve", id: 1 })).toBe(resolved);
  });

  it("resolves every outstanding request as cancelled during teardown", () => {
    const results: boolean[] = [];
    resolvePendingConfirmations([
      (result) => results.push(result),
      (result) => results.push(result),
    ]);

    expect(results).toEqual([false, false]);
  });
});
