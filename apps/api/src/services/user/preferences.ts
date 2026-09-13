import type { UserPreferences } from "@repo/types";
import type { UserPreferencesUpdateInput } from "@repo/validation";
import { getDb } from "../../lib/prisma";

export function serializePreferences(row: {
  id: string;
  userId: string;
  dayBoundary: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string | null;
  suppressCheckInsDuringFocus: boolean;
  createdAt: Date;
  updatedAt: Date;
}): UserPreferences {
  return {
    id: row.id,
    userId: row.userId,
    dayBoundary: row.dayBoundary,
    quietHoursEnabled: row.quietHoursEnabled,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    timezone: row.timezone,
    suppressCheckInsDuringFocus: row.suppressCheckInsDuringFocus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const db = getDb();
  let row = await db.userPreference.findUnique({
    where: { userId },
  });

  if (!row) {
    row = await db.userPreference.create({
      data: {
        userId,
        dayBoundary: "00:00",
        quietHoursEnabled: true,
        quietHoursStart: "23:58",
        quietHoursEnd: "08:00",
        timezone: null,
        suppressCheckInsDuringFocus: true,
      },
    });
  }

  return serializePreferences(row);
}

export async function updateUserPreferences(
  userId: string,
  patch: UserPreferencesUpdateInput,
): Promise<UserPreferences> {
  const db = getDb();
  const row = await db.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      dayBoundary: patch.dayBoundary ?? "00:00",
      quietHoursEnabled: patch.quietHoursEnabled ?? true,
      quietHoursStart: patch.quietHoursStart ?? "23:58",
      quietHoursEnd: patch.quietHoursEnd ?? "08:00",
      timezone: patch.timezone ?? null,
      suppressCheckInsDuringFocus: patch.suppressCheckInsDuringFocus ?? true,
    },
    update: {
      ...(patch.dayBoundary !== undefined ? { dayBoundary: patch.dayBoundary } : {}),
      ...(patch.quietHoursEnabled !== undefined ? { quietHoursEnabled: patch.quietHoursEnabled } : {}),
      ...(patch.quietHoursStart !== undefined ? { quietHoursStart: patch.quietHoursStart } : {}),
      ...(patch.quietHoursEnd !== undefined ? { quietHoursEnd: patch.quietHoursEnd } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.suppressCheckInsDuringFocus !== undefined
        ? { suppressCheckInsDuringFocus: patch.suppressCheckInsDuringFocus }
        : {}),
    },
  });

  return serializePreferences(row);
}
