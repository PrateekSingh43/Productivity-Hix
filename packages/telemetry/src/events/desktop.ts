export type ActiveWindowData = {
  application: string;
  windowTitle: string;
  processId?: number;
  appPath?: string;
};

export type AfkData = {
  state: "active" | "afk";
};

export type InputActivityData = {
  keyPresses?: number;
  mouseClicks?: number;
  mouseMovement?: number;
};

import type { CollectorProvenance } from "./provenance";

export type DesktopWindowEvent = {
  eventId: string;
  source: "desktop";
  installationId: string;
  eventType: "active_window";
  timestamp: string;
  durationMs: number;
  data: ActiveWindowData;
  provenance?: CollectorProvenance;
};

export type DesktopAfkEvent = {
  eventId: string;
  source: "desktop";
  installationId: string;
  eventType: "afk";
  timestamp: string;
  durationMs: number;
  data: AfkData;
  provenance?: CollectorProvenance;
};

export type DesktopInputEvent = {
  eventId: string;
  source: "desktop";
  installationId: string;
  eventType: "input";
  timestamp: string;
  durationMs: number;
  data: InputActivityData;
  provenance?: CollectorProvenance;
};

export type DesktopActivityEvent =
  | DesktopWindowEvent
  | DesktopAfkEvent
  | DesktopInputEvent;
