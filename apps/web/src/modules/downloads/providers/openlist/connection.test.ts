import { describe, expect, it } from "vitest";

import type { RuntimeSettings } from "@/modules/core/settings";

import { checkOpenListConnection } from "./connection";

describe("checkOpenListConnection", () => {
  it("does not call OpenList when provider is disabled", async () => {
    const requests: string[] = [];
    const result = await checkOpenListConnection({
      fetchImpl: async (input) => {
        requests.push(String(input));
        return Response.json({ code: 200 });
      },
      settings: runtimeSettings({ openlistEnabled: false }),
    });

    expect(result.status).toBe("disabled");
    expect(requests).toEqual([]);
  });

  it("requires base URL and token before probing", async () => {
    const result = await checkOpenListConnection({
      settings: runtimeSettings({ openlistEnabled: true, openlistBaseUrl: "", openlistToken: "" }),
    });

    expect(result.status).toBe("missing_settings");
    expect(result.publicApi).toBeNull();
    expect(result.accountApi).toBeNull();
  });

  it("probes public and account APIs without returning token", async () => {
    const requests: Array<{ authorization: string | null; url: string }> = [];
    const result = await checkOpenListConnection({
      fetchImpl: async (input, init) => {
        requests.push({
          authorization: new Headers(init?.headers).get("Authorization"),
          url: String(input),
        });
        return Response.json({ code: 200, message: "success" });
      },
      settings: runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244/root",
        openlistEnabled: true,
        openlistToken: "secret-openlist-token",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("reachable");
    expect(requests.map((request) => request.url)).toEqual([
      "http://127.0.0.1:5244/root/api/public/offline_download_tools",
      "http://127.0.0.1:5244/root/api/me",
    ]);
    expect(requests[0]?.authorization).toBeNull();
    expect(requests[1]?.authorization).toBe("secret-openlist-token");
    expect(JSON.stringify(result)).not.toContain("secret-openlist-token");
  });

  it("reports unauthorized token checks", async () => {
    let requestCount = 0;
    const result = await checkOpenListConnection({
      fetchImpl: async () => {
        requestCount += 1;
        return Response.json({ code: requestCount === 1 ? 200 : 401, message: "unauthorized" }, { status: requestCount === 1 ? 200 : 401 });
      },
      settings: runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244",
        openlistEnabled: true,
        openlistToken: "bad-token",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("unauthorized");
    expect(result.accountApi?.status).toBe(401);
  });
});

function runtimeSettings(overrides: Partial<RuntimeSettings> = {}): RuntimeSettings {
  return {
    cacheDirectory: ".data/cache",
    cacheSizeMb: 1024,
    downloadDefaultTargetDirectory: "",
    listenHost: "127.0.0.1",
    metadataImportToken: "",
    openlistBaseUrl: "",
    openlistEnabled: false,
    openlistToken: "",
    readerImmersiveDefault: false,
    readerPreloadAheadPages: 2,
    readerPreloadEnabled: true,
    readerThumbnailSidebarDefault: true,
    readerThumbnailTtlDays: 30,
    themeMode: "light",
    ...overrides,
  };
}
