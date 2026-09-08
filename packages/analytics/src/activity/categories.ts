import type { NormalizedActivityEvent } from "@repo/types";

function text(event?: NormalizedActivityEvent | null): string {
  if (!event || !event.data || typeof event.data !== "object") return "";
  return Object.values(event.data)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

const CODING_PATTERN = /\b(visual studio|code|cursor|terminal|shell|git|jetbrains|vim|neovim)\b/i;

export function isCodingActivity(event?: NormalizedActivityEvent | null): boolean {
  if (!event) return false;
  return CODING_PATTERN.test(text(event));
}

const IDLE_PATTERN = /\b(afk|idle|away from keyboard)\b/i;

export function isIdleActivity(event?: NormalizedActivityEvent | null): boolean {
  if (!event) return false;
  if (event.watcher === "afk") return true;
  return IDLE_PATTERN.test(text(event));
}

