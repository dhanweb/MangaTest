import { describe, expect, it } from "vitest";

import { getReaderKeyboardCommand, type ReaderKeyboardEventLike } from "./keyboard-shortcuts";

describe("getReaderKeyboardCommand", () => {
  it("maps vertical reading keys to scroll commands", () => {
    expect(command({ key: "ArrowDown" })).toBe("scroll_down");
    expect(command({ key: "s" })).toBe("scroll_down");
    expect(command({ key: " " })).toBe("scroll_down");
    expect(command({ key: "ArrowUp" })).toBe("scroll_up");
    expect(command({ key: "W" })).toBe("scroll_up");
    expect(command({ key: " ", shiftKey: true })).toBe("scroll_up");
  });

  it("maps navigation and chrome keys", () => {
    expect(command({ key: "Home" })).toBe("go_to_start");
    expect(command({ key: "End" })).toBe("go_to_end");
    expect(command({ key: "t" })).toBe("toggle_toolbar");
    expect(command({ key: "Escape" })).toBe("back_to_detail");
  });

  it("ignores modified, handled, composing, and editable-target events", () => {
    expect(command({ key: "s", ctrlKey: true })).toBeNull();
    expect(command({ key: "s", defaultPrevented: true })).toBeNull();
    expect(command({ key: "s", isComposing: true })).toBeNull();
    expect(command({ key: "s", target: { tagName: "INPUT" } as unknown as EventTarget })).toBeNull();
  });
});

function command(event: ReaderKeyboardEventLike) {
  return getReaderKeyboardCommand(event);
}
