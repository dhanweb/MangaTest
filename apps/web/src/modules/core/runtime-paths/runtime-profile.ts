import { readFileSync } from "node:fs";

export { runtimeProfiles, type RuntimeProfile } from "./runtime-profile-contract";
import { runtimeProfiles, type RuntimeProfile } from "./runtime-profile-contract";

export interface RuntimeEnvironment {
  profile: RuntimeProfile;
  platform: NodeJS.Platform;
  wslDistroName: string | null;
}

export interface RuntimeEnvironmentDetectionInput {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  procVersion: string;
}

export function detectRuntimeEnvironment(input: RuntimeEnvironmentDetectionInput): RuntimeEnvironment {
  const override = input.env.MANGATEST_PATH_PROFILE?.trim().toLowerCase();

  if (override && !runtimeProfiles.includes(override as RuntimeProfile)) {
    throw new Error(`MANGATEST_PATH_PROFILE must be one of: ${runtimeProfiles.join(", ")}`);
  }

  const profile =
    (override as RuntimeProfile | undefined) ??
    (input.platform === "win32"
      ? "windows"
      : input.platform === "linux" &&
          Boolean(input.env.WSL_DISTRO_NAME || input.env.WSL_INTEROP || /microsoft/i.test(input.procVersion))
        ? "wsl"
        : "linux");

  return {
    profile,
    platform: input.platform,
    wslDistroName: input.env.WSL_DISTRO_NAME ?? null,
  };
}

export function detectCurrentRuntimeEnvironment(): RuntimeEnvironment {
  let procVersion = "";

  if (process.platform === "linux") {
    try {
      // Keep WSL detection best-effort. The environment variables are the
      // primary signal, while /proc/version covers older WSL installations.
      procVersion = readFileSync("/proc/version", "utf8");
    } catch {
      procVersion = "";
    }
  }

  return detectRuntimeEnvironment({
    platform: process.platform,
    env: process.env,
    procVersion,
  });
}
