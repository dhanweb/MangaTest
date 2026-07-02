import path from "node:path";

export interface PathValidationResult {
  isValid: boolean;
  normalizedPath: string | null;
  reason: string | null;
}

export function validateAbsolutePath(input: string): PathValidationResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      isValid: false,
      normalizedPath: null,
      reason: "路径不能为空。",
    };
  }

  if (!path.isAbsolute(trimmed)) {
    return {
      isValid: false,
      normalizedPath: null,
      reason: "必须使用绝对路径。系统不会自动创建父目录。",
    };
  }

  return {
    isValid: true,
    normalizedPath: path.normalize(trimmed),
    reason: null,
  };
}
