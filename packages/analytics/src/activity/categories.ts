import type { NormalizedActivityEvent } from "@repo/types";

function text(event: NormalizedActivityEvent) {
  return Object.values(event.data)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

export function isCodingActivity(event: NormalizedActivityEvent) {
  return /code|visual studio|cursor|terminal|shell|git|jetbrains|vim|neovim/.test(text(event));
}

export function isIdleActivity(event: NormalizedActivityEvent) {
  return event.watcher === "afk" || /afk|away|idle/.test(text(event));
}
