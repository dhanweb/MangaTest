import path from "node:path";

export type PortableRelativePath = string & { readonly __portableRelativePath: unique symbol };

export function parsePortableRelativePath(input: string): PortableRelativePath {
  if (
    !input ||
    input.includes("\0") ||
    input.includes("\\") ||
    input.startsWith("/") ||
    /^[A-Za-z]:/.test(input) ||
    input.startsWith("//")
  ) {
    throw new Error("Invalid portable relative path.");
  }

  const segments = input.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("Portable relative path escapes its root.");
  }

  return input as PortableRelativePath;
}

export function toPortableRelativePath(input: string): PortableRelativePath {
  return parsePortableRelativePath(input.replaceAll("\\", "/").split(path.sep).join("/"));
}

export function resolvePortableChild(rootAbsolutePath: string, relativePath: PortableRelativePath): string {
  const root = path.resolve(rootAbsolutePath);
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Resolved path escapes its root.");
  }

  return target;
}
