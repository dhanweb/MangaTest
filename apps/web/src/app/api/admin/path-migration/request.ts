import { runtimeProfiles, type RuntimeProfile } from "@/modules/core/runtime-paths";
import {
  PathMigrationError,
  type PathMigrationInput,
} from "@/modules/library/path-migration";

export class PathMigrationRequestError extends Error {
  readonly code = "invalid_input" as const;

  constructor(message: string) {
    super(message);
    this.name = "PathMigrationRequestError";
  }
}

export function parsePreviewRequest(payload: unknown): PathMigrationInput {
  const body = asRecord(payload);
  return {
    targetProfile: parseRuntimeProfile(body.targetProfile),
    rootMappings: parseRootMappings(body.rootMappings),
  };
}

export function parseApplyRequest(payload: unknown): PathMigrationInput & { fingerprint: string; confirmBackup: boolean } {
  const body = asRecord(payload);
  const fingerprint = body.fingerprint;

  if (typeof fingerprint !== "string" || !/^[a-f\d]{64}$/i.test(fingerprint)) {
    throw new PathMigrationRequestError("迁移报告指纹无效，请重新生成预览。");
  }

  if (body.confirmBackup !== true) {
    throw new PathMigrationRequestError("必须明确确认迁移前创建 SQLite 备份。");
  }

  return {
    targetProfile: parseRuntimeProfile(body.targetProfile),
    rootMappings: parseRootMappings(body.rootMappings),
    fingerprint,
    confirmBackup: true,
  };
}

export function migrationErrorResponse(error: unknown) {
  if (error instanceof PathMigrationRequestError) {
    return Response.json({ error: error.message, code: error.code }, { status: 400 });
  }

  if (error instanceof PathMigrationError) {
    const status = error.code === "blocked" || error.code === "stale_report" ? 409 : error.code === "invariant_mismatch" ? 500 : 400;
    return Response.json({ error: safeMigrationErrorMessage(error.code), code: error.code }, { status });
  }

  return Response.json({ error: "路径迁移请求失败。", code: "unexpected_error" }, { status: 500 });
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new PathMigrationRequestError("请求体必须是 JSON 对象。");
  }

  return payload as Record<string, unknown>;
}

function parseRuntimeProfile(value: unknown): RuntimeProfile {
  if (typeof value !== "string" || !runtimeProfiles.includes(value as RuntimeProfile)) {
    throw new PathMigrationRequestError("目标运行环境必须是 windows、wsl 或 linux。");
  }

  return value as RuntimeProfile;
}

function parseRootMappings(value: unknown): PathMigrationInput["rootMappings"] {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new PathMigrationRequestError("rootMappings 必须是数组。");
  }

  const seenRootIds = new Set<string>();
  return value.map((item) => {
    const mapping = asRecord(item);
    const rootId = mapping.rootId;
    const targetPath = mapping.targetPath;

    if (typeof rootId !== "string" || !rootId.trim()) {
      throw new PathMigrationRequestError("rootMappings 中的 rootId 必须是非空字符串。");
    }
    if (seenRootIds.has(rootId)) {
      throw new PathMigrationRequestError("rootMappings 不能重复指定同一个漫画根目录。");
    }
    seenRootIds.add(rootId);

    if (targetPath !== undefined && targetPath !== null && typeof targetPath !== "string") {
      throw new PathMigrationRequestError("rootMappings 中的 targetPath 必须是字符串或 null。");
    }

    return {
      rootId,
      targetPath: targetPath === null ? null : targetPath,
    };
  });
}

function safeMigrationErrorMessage(code: PathMigrationError["code"]) {
  switch (code) {
    case "stale_report":
      return "迁移预览已过期，请重新生成预览后再试。";
    case "blocked":
      return "迁移当前被安全检查阻止，请查看最新预览中的阻塞项。";
    case "backup_required":
      return "必须明确确认迁移前创建 SQLite 备份。";
    case "invalid_input":
      return "路径迁移参数无效。";
    case "invariant_mismatch":
      return "迁移后的业务记录校验失败，请使用备份回滚并检查日志。";
  }
}
