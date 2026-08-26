export const runtimeProfiles = ["windows", "wsl", "linux"] as const;

export type RuntimeProfile = (typeof runtimeProfiles)[number];
