import type { BrowserActivityEvent } from "../events/browser";

/**
 * Sanitizes a URL for privacy:
 * - Strips query parameters (search query, tokens, session IDs)
 * - Strips fragments (#hash)
 * - Normalizes protocol and hostname
 * - Preserves pathname
 */
export function sanitizeUrl(rawUrl: string): { sanitizedUrl: string; domain: string } {
  try {
    const url = new URL(rawUrl);
    const domain = url.hostname.toLowerCase();
    const sanitizedUrl = `${url.protocol}//${url.host}${url.pathname}`;
    return { sanitizedUrl, domain };
  } catch {
    // If URL parsing fails, extract domain heuristics safely
    const clean = rawUrl.split("?")[0]?.split("#")[0] ?? rawUrl;
    const match = clean.match(/^(?:https?:\/\/)?([^/:]+)/i);
    const domain = match?.[1]?.toLowerCase() ?? "unknown";
    return { sanitizedUrl: clean, domain };
  }
}

export type RawBrowserTabEvent = {
  url: string;
  title: string;
  timestamp?: string;
  durationMs?: number;
  audible?: boolean;
  incognito?: boolean;
  tabCount?: number;
};

export function normalizeBrowserTabEvent(
  installationId: string,
  rawEvent: RawBrowserTabEvent,
): BrowserActivityEvent {
  const { sanitizedUrl, domain } = sanitizeUrl(rawEvent.url);
  const timestamp = rawEvent.timestamp ? new Date(rawEvent.timestamp).toISOString() : new Date().toISOString();
  const timeMs = Date.parse(timestamp);
  
  // Deterministic event ID based on installation + domain + timestamp
  const eventId = `brw-${domain.replace(/[^a-z0-9]/g, "")}-${timeMs.toString(16)}`;

  return {
    eventId,
    source: "browser",
    installationId,
    eventType: "active_tab",
    timestamp,
    durationMs: Math.max(0, rawEvent.durationMs ?? 0),
    data: {
      domain,
      sanitizedUrl,
      pageTitle: rawEvent.title || "",
      audible: rawEvent.audible,
      incognito: rawEvent.incognito,
      tabCount: rawEvent.tabCount,
    },
    provenance: {
      collector: "browser-extension",
    },
  };
}

export function normalizeBrowserIdleEvent(
  installationId: string,
  state: "active" | "idle",
  timestamp = new Date().toISOString(),
): BrowserActivityEvent {
  const normalizedTimestamp = new Date(timestamp).toISOString();
  const eventId = `brw-idle-${installationId.replace(/[^a-z0-9]/gi, "")}-${Date.parse(normalizedTimestamp).toString(16)}-${state}`;

  return {
    eventId,
    source: "browser",
    installationId,
    eventType: "browser_idle",
    timestamp: normalizedTimestamp,
    durationMs: 0,
    data: {
      domain: "browser",
      sanitizedUrl: "",
      pageTitle: "",
      idleState: state,
    },
    provenance: {
      collector: "browser-extension",
    },
  };
}
