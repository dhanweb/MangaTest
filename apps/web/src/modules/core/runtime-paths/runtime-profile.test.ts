import { describe, expect, it } from "vitest";

import { detectRuntimeEnvironment } from "./runtime-profile";

describe("detectRuntimeEnvironment", () => {
  it("detects Windows", () => {
    expect(detectRuntimeEnvironment({ platform: "win32", env: {}, procVersion: "" }).profile).toBe("windows");
  });

  it("detects WSL", () => {
    expect(
      detectRuntimeEnvironment({ platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" }, procVersion: "" }).profile,
    ).toBe("wsl");
  });

  it("honors a valid explicit override", () => {
    expect(
      detectRuntimeEnvironment({ platform: "linux", env: { MANGATEST_PATH_PROFILE: "linux" }, procVersion: "microsoft" }).profile,
    ).toBe("linux");
  });

  it("rejects an invalid explicit override", () => {
    expect(() =>
      detectRuntimeEnvironment({ platform: "linux", env: { MANGATEST_PATH_PROFILE: "mac" }, procVersion: "" }),
    ).toThrow(/MANGATEST_PATH_PROFILE/);
  });
});
