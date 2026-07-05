export type ReaderKeyboardCommand =
  | "back_to_detail"
  | "go_to_end"
  | "go_to_start"
  | "scroll_down"
  | "scroll_up"
  | "toggle_toolbar";

export interface ReaderKeyboardEventLike {
  altKey?: boolean;
  ctrlKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
}

export function getReaderKeyboardCommand(event: ReaderKeyboardEventLike): ReaderKeyboardCommand | null {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
    return null;
  }

  const key = normalizeKey(event.key);

  if (key === "arrowup" || key === "w" || (key === "space" && event.shiftKey)) {
    return "scroll_up";
  }

  if (key === "arrowdown" || key === "s" || key === "space") {
    return "scroll_down";
  }

  if (key === "home") {
    return "go_to_start";
  }

  if (key === "end") {
    return "go_to_end";
  }

  if (key === "t") {
    return "toggle_toolbar";
  }

  if (key === "escape") {
    return "back_to_detail";
  }

  return null;
}

function normalizeKey(key: string) {
  return key === " " ? "space" : key.toLowerCase();
}

function isEditableTarget(target: EventTarget | null | undefined) {
  if (!target || typeof target !== "object") {
    return false;
  }

  const element = target as {
    closest?: (selector: string) => unknown;
    isContentEditable?: boolean;
    tagName?: string;
  };
  const tagName = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";

  return (
    element.isContentEditable === true ||
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    Boolean(element.closest?.('[contenteditable="true"]'))
  );
}
