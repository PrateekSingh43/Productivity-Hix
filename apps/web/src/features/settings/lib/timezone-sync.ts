"use client";

import { normalizeTimezone } from "@repo/validation";
import { updateUserPreferences } from "../api/client";

const FLAG_KEY = "phix:timezone-synced";

/**
 * Persists the browser's timezone to the server once (per zone).
 *
 * Why this exists: every day boundary in the system (telemetry attribution,
 * worker materialization, timeline reads) keys off the stored user
 * preference, which starts empty (= UTC). A user in Asia/Kolkata would
 * otherwise see "Sept 26" mean something different here than in
 * ActivityWatch, forever. This reads the browser zone, saves it locally so
 * it runs once, and PATCHes preferences so ingest + worker + reads agree.
 * Travel is handled for free: if the browser zone ever differs from the
 * saved flag, it re-syncs. Best-effort and silent — the timeline renders
 * with the per-request zone regardless.
 */
export async function syncBrowserTimezone(): Promise<void> {
  if (typeof window === "undefined") return;
  let browserTz: string;
  try {
    browserTz = normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
  } catch {
    return;
  }
  try {
    if (window.localStorage.getItem(FLAG_KEY) === browserTz) return;
    await updateUserPreferences({ timezone: browserTz });
    window.localStorage.setItem(FLAG_KEY, browserTz);
    if (process.env.NODE_ENV !== "production") {
      // Dev-only trace (no UI surface): verify via API GET /api/user/preferences.
      console.debug(`[timezone-sync] persisted ${browserTz} to preferences`);
    }
  } catch {
    // Server unreachable etc. — try again on next mount.
  }
}
