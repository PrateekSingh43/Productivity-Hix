import type { CollectorProvenance } from "./provenance";

export type BrowserActivityData = {
  domain: string;
  sanitizedUrl: string;
  pageTitle: string;
  audible?: boolean;
  incognito?: boolean;
  tabCount?: number;
  idleState?: "active" | "idle";
};

export type BrowserActivityEvent = {
  eventId: string;
  source: "browser";
  installationId: string;
  eventType: "active_tab" | "tab_switch" | "browser_idle";
  timestamp: string;
  durationMs: number;
  data: BrowserActivityData;
  provenance?: CollectorProvenance;
};
