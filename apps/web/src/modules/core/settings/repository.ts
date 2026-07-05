import { bootstrapDatabase, getDb, settings } from "@/modules/core/db";

import { defaultRuntimeSettings, settingDefinitions } from "./defaults";
import type { RuntimeSettings, SettingValueType } from "./types";

export type RuntimeSettingsInput = Partial<RuntimeSettings>;

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  bootstrapDatabase();

  const db = getDb();
  const rows = db.select().from(settings).all();
  const valueByKey = new Map(rows.map((row) => [row.key, row]));
  const runtimeSettings = { ...defaultRuntimeSettings };

  for (const definition of settingDefinitions) {
    const key = definition.key as keyof RuntimeSettings;
    const row = valueByKey.get(key);
    if (!row) {
      continue;
    }

    runtimeSettings[key] = parseSettingValue(row.value, row.valueType) as never;
  }

  runtimeSettings.themeMode = normalizeThemeMode();

  return runtimeSettings;
}

export async function saveRuntimeSettings(input: RuntimeSettingsInput): Promise<RuntimeSettings> {
  bootstrapDatabase();

  const db = getDb();
  const now = new Date().toISOString();

  for (const definition of settingDefinitions) {
    const key = definition.key as keyof RuntimeSettings;
    if (!(key in input)) {
      continue;
    }

    const value = input[key];
    if (value === undefined) {
      continue;
    }

    db.insert(settings)
      .values({
        key,
        value: serializeSettingValue(value),
        valueType: definition.valueType,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: serializeSettingValue(value),
          valueType: definition.valueType,
          updatedAt: now,
        },
      })
      .run();
  }

  return getRuntimeSettings();
}

function parseSettingValue(value: string, valueType: SettingValueType) {
  if (valueType === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (valueType === "boolean") {
    return value === "true";
  }

  if (valueType === "json") {
    return JSON.parse(value);
  }

  return value;
}

function serializeSettingValue(value: RuntimeSettings[keyof RuntimeSettings]) {
  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function normalizeThemeMode(): RuntimeSettings["themeMode"] {
  // The MVP visual system is light-only. Mantine's automatic dark scheme uses
  // dark component surfaces that clash with the app's current light tokens.
  return "light";
}
