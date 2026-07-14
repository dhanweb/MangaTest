import { describe, expect, it, vi } from "vitest";

import type { RuntimeSettings } from "@/modules/core/settings";

import type { DownloadProviderPrepareInput } from "../types";

import {
  checkOpenListConnection,
  ensureOpenListToken,
  hashOpenListPassword,
  inspectOpenListResource,
  listOpenListDirectory,
  loginOpenList,
  normalizeOpenListResourcePath,
  resolveOpenListDownloadLink,
} from "./connection";
import { openlistProviderAdapter } from "./index";

describe("checkOpenListConnection", () => {
  it("checks the connection even when the provider is disabled", async () => {
    const requests: string[] = [];
    const result = await checkOpenListConnection({
      fetchImpl: async (input) => {
        requests.push(String(input));
        return Response.json({ code: 200 });
      },
      settings: runtimeSettings({
        openlistEnabled: false,
        openlistBaseUrl: "http://127.0.0.1:5244",
        openlistToken: "configured-token",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("reachable");
    expect(requests).toHaveLength(2);
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

describe("loginOpenList", () => {
  it("requires base URL, username, and password", async () => {
    const result = await loginOpenList({
      baseUrl: "",
      password: "",
      username: "",
    });

    expect(result.status).toBe("missing_settings");
    expect(result.token).toBeNull();
    expect(result.authApi).toBeNull();
  });

  it("posts a hashed password and returns token only at the top level", async () => {
    const requests: Array<{ body: Record<string, unknown>; headers: Headers; method: string; url: string }> = [];
    const result = await loginOpenList(
      {
        baseUrl: "http://127.0.0.1:5244/root",
        otpCode: "123456",
        password: "plain-password",
        username: "admin",
      },
      {
        fetchImpl: async (input, init) => {
          requests.push({
            body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
            headers: new Headers(init?.headers),
            method: init?.method ?? "GET",
            url: String(input),
          });
          return Response.json({ code: 200, data: { token: "openlist-login-token" }, message: "success" });
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe("success");
    expect(result.token).toBe("openlist-login-token");
    expect(requests[0]?.url).toBe("http://127.0.0.1:5244/root/api/auth/login/hash");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("Client-Id")).toBe("mangatest-local");
    expect(requests[0]?.body).toEqual({
      otp_code: "123456",
      password: hashOpenListPassword("plain-password"),
      username: "admin",
    });
    expect(JSON.stringify(requests)).not.toContain("plain-password");
    expect(JSON.stringify(result.authApi)).not.toContain("openlist-login-token");
  });

  it("reports unauthorized login attempts", async () => {
    const result = await loginOpenList(
      {
        baseUrl: "http://127.0.0.1:5244",
        password: "wrong",
        username: "admin",
      },
      {
        fetchImpl: async () => Response.json({ code: 401, message: "unauthorized" }, { status: 401 }),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe("unauthorized");
    expect(result.token).toBeNull();
    expect(result.authApi?.status).toBe(401);
  });
});

describe("normalizeOpenListResourcePath", () => {
  it("accepts plain paths and openlist-prefixed paths", () => {
    expect(normalizeOpenListResourcePath("Library/Comic.cbz")).toBe("/Library/Comic.cbz");
    expect(normalizeOpenListResourcePath("openlist:/Library/Comic.cbz")).toBe("/Library/Comic.cbz");
    expect(normalizeOpenListResourcePath("openlist://Cloud/Library/Comic%20A.cbz")).toBe("/Cloud/Library/Comic A.cbz");
    expect(normalizeOpenListResourcePath("")).toBeNull();
    expect(normalizeOpenListResourcePath("/")).toBeNull();
  });
});

describe("inspectOpenListResource", () => {
  it("posts to /api/fs/get and returns only safe resource metadata", async () => {
    const requests: Array<{ body: Record<string, unknown>; authorization: string | null; method: string; url: string }> = [];
    const result = await inspectOpenListResource("openlist:/Library/Comic.cbz", {
      settings: runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244/root",
        openlistEnabled: true,
        openlistToken: "secret-openlist-token",
      }),
      fetchImpl: async (input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
          authorization: new Headers(init?.headers).get("Authorization"),
          method: init?.method ?? "GET",
          url: String(input),
        });
        return Response.json({
          code: 200,
          data: {
            is_dir: false,
            modified: "2026-01-01T00:00:00Z",
            name: "Comic.cbz",
            provider: "Local",
            raw_url: "https://private.example/download/Comic.cbz?sign=secret",
            size: 2097152,
            type: 4,
          },
          message: "success",
        });
      },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("file_ready");
    expect(result.path).toBe("/Library/Comic.cbz");
    expect(result.resource).toEqual({
      isDirectory: false,
      modifiedAt: "2026-01-01T00:00:00Z",
      name: "Comic.cbz",
      provider: "Local",
      rawUrlAvailable: true,
      sizeBytes: 2097152,
      type: 4,
    });
    expect(requests[0]?.url).toBe("http://127.0.0.1:5244/root/api/fs/get");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.authorization).toBe("secret-openlist-token");
    expect(requests[0]?.body).toEqual({
      page: 1,
      password: "",
      path: "/Library/Comic.cbz",
      per_page: 0,
      refresh: false,
    });
    expect(JSON.stringify(result)).not.toContain("secret-openlist-token");
    expect(JSON.stringify(result)).not.toContain("private.example");
    expect(JSON.stringify(result)).not.toContain("sign=secret");
  });

  it("reports missing remote files", async () => {
    const result = await inspectOpenListResource("/Missing.cbz", {
      settings: runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244",
        openlistEnabled: true,
        openlistToken: "secret-openlist-token",
      }),
      fetchImpl: async () => Response.json({ code: 404, message: "object not found" }),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("not_found");
    expect(result.resource).toBeNull();
  });
});

describe("resolveOpenListDownloadLink", () => {
  it("returns the raw URL only for internal download execution", async () => {
    const result = await resolveOpenListDownloadLink("openlist:/Library/Comic.cbz", {
      settings: runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244/root",
        openlistEnabled: true,
        openlistToken: "secret-openlist-token",
      }),
      fetchImpl: async () =>
        Response.json({
          code: 200,
          data: {
            is_dir: false,
            name: "Comic.cbz",
            provider: "Local",
            raw_url: "https://private.example/download/Comic.cbz?sign=secret",
            size: 2097152,
            type: 4,
          },
          message: "success",
        }),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("file_ready");
    expect(result.rawUrl).toBe("https://private.example/download/Comic.cbz?sign=secret");
    expect(result.fileApi).not.toEqual(expect.objectContaining({ rawUrl: expect.anything() }));
    expect(result.resource).toEqual({
      isDirectory: false,
      modifiedAt: null,
      name: "Comic.cbz",
      provider: "Local",
      rawUrlAvailable: true,
      sizeBytes: 2097152,
      type: 4,
    });
  });

  it("flattens OpenList http.Header array values and joins relative link URLs", async () => {
    const requests: string[] = [];
    const result = await resolveOpenListDownloadLink("/115Open/Temp/Comic.cbz", {
      settings: runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244",
        openlistEnabled: true,
        openlistToken: "secret-openlist-token",
      }),
      fetchImpl: async (input) => {
        const url = String(input);
        requests.push(url);

        if (url.endsWith("/api/fs/link")) {
          return Response.json({
            code: 200,
            data: {
              // Alist/OpenList serializes http.Header as map[string][]string
              header: {
                "User-Agent": ["Mozilla/5.0 OpenList-115"],
                Referer: ["https://115.com/"],
                empty: [],
              },
              url: "/d/115Open/Temp/Comic.cbz?sign=secret",
            },
            message: "success",
          });
        }

        return Response.json({
          code: 200,
          data: {
            is_dir: false,
            name: "Comic.cbz",
            provider: "115 Open",
            raw_url: "",
            size: 1024,
            type: 4,
          },
          message: "success",
        });
      },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("file_ready");
    expect(result.rawUrl).toBe("http://127.0.0.1:5244/d/115Open/Temp/Comic.cbz?sign=secret");
    expect(result.headers).toEqual({
      "User-Agent": "Mozilla/5.0 OpenList-115",
      Referer: "https://115.com/",
    });
    expect(requests.some((url) => url.endsWith("/api/fs/get"))).toBe(true);
    expect(requests.some((url) => url.endsWith("/api/fs/link"))).toBe(true);
  });
});

describe("normalizeOpenListRequestHeaders", () => {
  it("accepts string and string[] header values", async () => {
    const { normalizeOpenListRequestHeaders } = await import("./connection");

    expect(
      normalizeOpenListRequestHeaders({
        "User-Agent": ["Mozilla/5.0"],
        Referer: "https://example.test/",
        "X-Empty": [],
        "X-Number": 1,
      }),
    ).toEqual({
      "User-Agent": "Mozilla/5.0",
      Referer: "https://example.test/",
    });
  });
});

describe("ensureOpenListToken / auto re-login", () => {
  it("returns existing token without calling login when forceRefresh is false", async () => {
    const result = await ensureOpenListToken(
      runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244",
        openlistToken: "still-valid-token",
        openlistUsername: "admin",
        openlistPassword: "secret",
      }),
      {
        forceRefresh: false,
        fetchImpl: async () => {
          throw new Error("login should not be called");
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.tokenRefreshed).toBe(false);
    expect(result.settings.openlistToken).toBe("still-valid-token");
  });

  it("fails clearly when token expired and credentials are missing", async () => {
    const result = await ensureOpenListToken(
      runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244",
        openlistToken: "expired",
        openlistUsername: "",
        openlistPassword: "",
      }),
      { forceRefresh: true },
    );

    expect(result.ok).toBe(false);
    expect(result.tokenRefreshed).toBe(false);
    expect(result.message).toContain("未保存账号密码");
  });

  it("re-logs in and retries download link when OpenList returns unauthorized", async () => {
    const { randomUUID } = await import("node:crypto");
    const { mkdir } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const workspace = path.join(os.tmpdir(), `mangatest-openlist-relogin-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    await mkdir(workspace, { recursive: true });
    process.env.MANGATEST_DB_PATH = dbPath;

    try {
      const { bootstrapDatabase } = await import("@/modules/core/db");
      const { saveRuntimeSettings } = await import("@/modules/core/settings");
      bootstrapDatabase();
      await saveRuntimeSettings({
        openlistEnabled: true,
        openlistBaseUrl: "http://127.0.0.1:5244",
        openlistToken: "expired-token",
        openlistUsername: "admin",
        openlistPassword: "plain-password",
      });

      let getCalls = 0;
      const result = await resolveOpenListDownloadLink("/Library/Comic.cbz", {
        settings: runtimeSettings({
          openlistEnabled: true,
          openlistBaseUrl: "http://127.0.0.1:5244",
          openlistToken: "expired-token",
          openlistUsername: "admin",
          openlistPassword: "plain-password",
        }),
        fetchImpl: async (input, init) => {
          const url = String(input);

          if (url.endsWith("/api/auth/login/hash")) {
            return Response.json({ code: 200, data: { token: "fresh-token" }, message: "success" });
          }

          if (url.endsWith("/api/fs/get")) {
            getCalls += 1;
            const auth = new Headers(init?.headers).get("Authorization");
            if (auth === "expired-token") {
              return Response.json({ code: 401, message: "token is expired" }, { status: 401 });
            }
            if (auth === "fresh-token") {
              return Response.json({
                code: 200,
                data: {
                  is_dir: false,
                  name: "Comic.cbz",
                  provider: "Local",
                  raw_url: "https://private.example/Comic.cbz?sign=secret",
                  size: 1024,
                  type: 4,
                },
                message: "success",
              });
            }
          }

          if (url.endsWith("/api/fs/link")) {
            return Response.json({
              code: 200,
              data: {
                url: "https://private.example/Comic.cbz?sign=secret",
                header: { "User-Agent": ["Mozilla/5.0"] },
              },
              message: "success",
            });
          }

          return Response.json({ code: 500, message: `unexpected ${url}` }, { status: 500 });
        },
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe("file_ready");
      expect(result.rawUrl).toBe("https://private.example/Comic.cbz?sign=secret");
      expect(result.headers["User-Agent"]).toBe("Mozilla/5.0");
      expect(getCalls).toBeGreaterThanOrEqual(2);

      const { getRuntimeSettings } = await import("@/modules/core/settings");
      const saved = await getRuntimeSettings();
      expect(saved.openlistToken).toBe("fresh-token");
    } finally {
      delete process.env.MANGATEST_DB_PATH;
    }
  });
});

describe("listOpenListDirectory", () => {
  it("posts to /api/fs/list and returns a safe directory preview", async () => {
    const requests: Array<{ body: Record<string, unknown>; authorization: string | null; method: string; url: string }> = [];
    const result = await listOpenListDirectory("openlist:/Library", {
      perPage: 3,
      settings: runtimeSettings({
        openlistBaseUrl: "http://127.0.0.1:5244/root",
        openlistEnabled: true,
        openlistToken: "secret-openlist-token",
      }),
      fetchImpl: async (input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
          authorization: new Headers(init?.headers).get("Authorization"),
          method: init?.method ?? "GET",
          url: String(input),
        });
        return Response.json({
          code: 200,
          data: {
            content: [
              { is_dir: true, name: "Series", provider: "Local", raw_url: "", size: 0, type: 1 },
              { is_dir: false, name: "Comic.cbz", provider: "Local", raw_url: "https://private.example/Comic.cbz?sign=secret", size: 42, type: 4 },
            ],
            has_more: false,
            page: 1,
            per_page: 3,
            provider: "Local",
            total: 2,
          },
          message: "success",
        });
      },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("reachable");
    expect(result.path).toBe("/Library");
    expect(result.directory?.total).toBe(2);
    expect(result.directory?.entries.map((entry) => entry.name)).toEqual(["Series", "Comic.cbz"]);
    expect(result.directory?.entries[1]?.rawUrlAvailable).toBe(true);
    expect(requests[0]?.url).toBe("http://127.0.0.1:5244/root/api/fs/list");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.authorization).toBe("secret-openlist-token");
    expect(requests[0]?.body).toEqual({
      page: 1,
      password: "",
      path: "/Library",
      per_page: 3,
      refresh: false,
    });
    expect(JSON.stringify(result)).not.toContain("secret-openlist-token");
    expect(JSON.stringify(result)).not.toContain("private.example");
    expect(JSON.stringify(result)).not.toContain("sign=secret");
  });
});

describe("openlistProviderAdapter.prepare", () => {
  it("probes remote file metadata before reporting it ready for temporary download", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        Response.json({
          code: 200,
          data: {
            is_dir: false,
            name: "Comic.cbz",
            provider: "Local",
            raw_url: "https://download.example/Comic.cbz?sign=secret",
            size: 1048576,
            type: 4,
          },
          message: "success",
        }),
    );

    try {
      const input = providerPrepareInput();
      const readiness = await openlistProviderAdapter.prepare(input);

      expect(readiness.canDispatch).toBe(true);
      expect(readiness.code).toBe("ready");
      expect(readiness.reason).toContain("Comic.cbz");
      expect(readiness.details).toEqual({
        rawUrlAvailable: true,
        remoteIsDirectory: false,
        remoteName: "Comic.cbz",
        remotePath: "/Library/Comic.cbz",
        remoteProvider: "Local",
        remoteSizeBytes: 1048576,
      });
      expect(JSON.stringify(readiness)).not.toContain("secret-openlist-token");
      expect(JSON.stringify(readiness)).not.toContain("download.example");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lists a directory preview without enabling download execution", async () => {
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0]) => {
      if (String(input).endsWith("/api/fs/list")) {
        return Response.json({
          code: 200,
          data: {
            content: [
              { is_dir: true, name: "Series", provider: "Local", raw_url: "", size: 0, type: 1 },
              { is_dir: false, name: "Comic.cbz", provider: "Local", raw_url: "https://download.example/Comic.cbz?sign=secret", size: 1048576, type: 4 },
            ],
            has_more: false,
            page: 1,
            per_page: 10,
            provider: "Local",
            total: 2,
          },
          message: "success",
        });
      }

      return Response.json({
        code: 200,
        data: {
          is_dir: true,
          name: "Library",
          provider: "Local",
          raw_url: "",
          size: 0,
          type: 1,
        },
        message: "success",
      });
    });

    try {
      const input = {
        ...providerPrepareInput(),
        resource: {
          ...providerPrepareInput().resource,
          resourceUrl: "/Library",
        },
      };
      const readiness = await openlistProviderAdapter.prepare(input);

      expect(readiness.canDispatch).toBe(false);
      expect(readiness.code).toBe("remote_resource_directory");
      expect(readiness.details).toEqual({
        rawUrlAvailable: false,
        remoteChildCount: 2,
        remoteDirectoryCount: 1,
        remoteFileCount: 1,
        remoteIsDirectory: true,
        remoteName: "Library",
        remotePath: "/Library",
        remotePreviewNames: "Series、Comic.cbz",
        remoteProvider: "Local",
        remoteSizeBytes: 0,
      });
      expect(JSON.stringify(readiness)).not.toContain("secret-openlist-token");
      expect(JSON.stringify(readiness)).not.toContain("download.example");
    } finally {
      vi.unstubAllGlobals();
    }
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
    openlistUsername: "",
    openlistPassword: "",
    readerImmersiveDefault: false,
    readerPreloadAheadPages: 2,
    readerPreloadEnabled: true,
    readerThumbnailSidebarDefault: true,
    readerThumbnailTtlDays: 30,
    themeMode: "light",
    aria2Enabled: false,
    aria2RpcUrl: "",
    aria2RpcToken: "",
    ...overrides,
  };
}

function providerPrepareInput(): DownloadProviderPrepareInput {
  return {
    resource: {
      comicId: "comic-1",
      comicTitle: "Comic",
      displayLabel: "OpenList",
      id: "resource-1",
      redactedResource: "openlist:...",
      resourceType: "openlist",
      resourceUrl: "/Library/Comic.cbz",
      sourceSite: "example",
    },
    settings: runtimeSettings({
      openlistBaseUrl: "http://127.0.0.1:5244",
      openlistEnabled: true,
      openlistToken: "secret-openlist-token",
    }),
    task: {
      comicId: "comic-1",
      comicResourceId: "resource-1",
      comicTitle: "Comic",
      createdAt: "2026-01-01T00:00:00.000Z",
      errorMessage: null,
      id: "task-1",
      offlineTaskId: null,
      provider: "openlist",
      redactedResource: "openlist:...",
      remoteTaskId: null,
      remotePath: null,
      resourceLabel: "OpenList",
      resourceType: "openlist",
      retryCount: 0,
      sourceSite: "example",
      status: "queued",
      targetDirectory: null,
      taskType: "offline" as const,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}
