import type { DesktopActivityEvent } from "./desktop";
import type { BrowserActivityEvent } from "./browser";

export * from "./desktop";
export * from "./browser";
export * from "./provenance";

export type TelemetryEvent = DesktopActivityEvent | BrowserActivityEvent;

export function isDesktopEvent(event: TelemetryEvent): event is DesktopActivityEvent {
  return event.source === "desktop";
}

export function isBrowserEvent(event: TelemetryEvent): event is BrowserActivityEvent {
  return event.source === "browser";
}
