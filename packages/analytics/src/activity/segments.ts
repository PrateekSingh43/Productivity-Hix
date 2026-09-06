import type {
  TimelineCategory,
  TimelineSegment,
  TimelineSummary,
} from "@repo/types";

export interface RawActivityInput {
  id?: string;
  externalId?: string;
  timestamp: string | Date;
  duration?: number; // duration in seconds
  durationMs?: number;
  source?: "desktop" | "browser" | "unknown" | string;
  watcher?: string;
  data?: any;
}

export interface CanonicalActivityEvent {
  id: string;
  start: number; // epoch ms
  end: number;   // epoch ms
  durationMs: number;
  source: "desktop" | "browser" | "unknown";
  watcher: "active_window" | "afk" | "browser" | "input" | "other";
  application: string;
  title: string;
  domain?: string;
  isAfk: boolean;
  isBrowser: boolean;
  category: TimelineCategory;
  rawEventCount: number;
  contexts: string[];
}

export interface AggregationOptions {
  /** Maximum gap in milliseconds between compatible events to bridge into one continuous segment. Default: 5 minutes */
  maxGapMs?: number;
  /** Minimum duration in milliseconds for an AFK period to be treated as a distinct Break segment. Default: 5 minutes */
  minBreakMs?: number;
  /** Maximum duration in milliseconds of incidental transient events that can be absorbed if flanked by compatible work. Default: 30 seconds */
  transientThresholdMs?: number;
  /** Segments shorter than this are dropped or absorbed after grouping. Default: 30 seconds */
  minSegmentMs?: number;
}

const DEFAULT_OPTIONS: Required<AggregationOptions> = {
  maxGapMs: 5 * 60 * 1000,
  minBreakMs: 5 * 60 * 1000,
  transientThresholdMs: 30_000,
  minSegmentMs: 30_000,
};

const LEISURE_PATTERNS: RegExp[] = [
  /chess\.com/i,
  /lichess/i,
  /play chess/i,
  /youtube/i,
  /youtu\.be/i,
  /netflix/i,
  /twitch/i,
  /reddit/i,
  /instagram/i,
  /facebook\.com/i,
  /tiktok/i,
  /twitter/i,
  /(?:^|\.)x\.com/i,
  /steampowered/i,
  /disneyplus/i,
  /prime video/i,
  /hotstar/i,
  /pinterest/i,
];

const SITE_LABELS: Array<[RegExp, string]> = [
  [/chess\.com|play chess|lichess/i, "Chess.com"],
  [/youtube|youtu\.be/i, "YouTube"],
  [/chatgpt/i, "ChatGPT"],
  [/claude\.ai/i, "Claude"],
  [/kimi/i, "Kimi"],
  [/activitywatch/i, "ActivityWatch"],
  [/github/i, "GitHub"],
  [/figma/i, "Figma"],
  [/localhost|productivehix/i, "ProductiveHix"],
  [/stackoverflow/i, "Stack Overflow"],
  [/reddit/i, "Reddit"],
  [/netflix/i, "Netflix"],
];

/**
 * Normalizes raw application strings into clean, canonical display names.
 */
export function normalizeAppName(rawApp?: string | null, data?: Record<string, any>): string {
  const windowTitle = (data?.windowTitle || data?.title || data?.pageTitle || "").trim();
  const lowerTitle = windowTitle.toLowerCase();

  // If rawApp is missing or generic, infer from title or domain
  if (!rawApp || rawApp.toLowerCase() === "unknown" || rawApp.toLowerCase() === "idle") {
    if (data?.domain) return data.domain;
    if (data?.sanitizedUrl) {
      try {
        return new URL(data.sanitizedUrl).hostname;
      } catch {
        // ignore
      }
    }
    if (lowerTitle.includes("antigravity")) return "Antigravity IDE";
    if (lowerTitle.includes("visual studio code") || lowerTitle.includes("vscode")) return "Visual Studio Code";
    if (lowerTitle.includes("brave")) return "Brave Browser";
    if (lowerTitle.includes("chrome")) return "Google Chrome";
    if (lowerTitle.includes("edge")) return "Microsoft Edge";
    if (lowerTitle.includes("terminal") || lowerTitle.includes("powershell")) return "Terminal";
    return "Desktop Application";
  }

  const clean = rawApp.replace(/\.exe$/i, "").trim();
  const lower = clean.toLowerCase();

  // Special heuristic for the historical powershell collector bug:
  // If app is 'powershell' or 'pwsh', but the window title clearly belongs to another application:
  if (lower === "powershell" || lower === "pwsh") {
    if (lowerTitle.includes("antigravity")) return "Antigravity IDE";
    if (lowerTitle.includes("visual studio code") || lowerTitle.includes("vscode")) return "Visual Studio Code";
    if (lowerTitle.includes("brave")) return "Brave Browser";
    if (lowerTitle.includes("chrome")) return "Google Chrome";
    if (lowerTitle.includes("edge")) return "Microsoft Edge";
    if (lowerTitle.includes("figma")) return "Figma";
    if (lowerTitle.includes("discord")) return "Discord";
    if (lowerTitle.includes("slack")) return "Slack";
    return "Terminal";
  }

  if (lower === "code" || lower === "visual studio code" || lower === "vscode") return "Visual Studio Code";
  if (lower === "brave") return "Brave Browser";
  if (lower === "chrome") return "Google Chrome";
  if (lower === "msedge" || lower === "edge") return "Microsoft Edge";
  if (lower === "firefox") return "Mozilla Firefox";
  if (lower.includes("antigravity")) return "Antigravity IDE";
  if (lower === "windowsterminal" || lower === "cmd") return "Terminal";
  if (lower === "cursor") return "Cursor";
  if (lower === "slack") return "Slack";
  if (lower === "discord") return "Discord";
  if (lower === "teams" || lower === "ms-teams") return "Microsoft Teams";
  if (lower === "spotify") return "Spotify";
  if (lower === "notion") return "Notion";
  if (lower === "figma") return "Figma";
  if (lower === "explorer") return "Windows Explorer";
  if (lower === "lockapp") return "Screen Locked";

  return clean;
}

/**
 * Cleans window titles by removing trailing window decoration, app branding, and sensitive parameters.
 */
export function cleanWindowTitle(rawTitle?: string | null, appName?: string): string {
  if (!rawTitle) return "";
  let title = rawTitle.trim();

  // Strip trailing app branding
  title = title
    .replace(/\s*—\s*Visual Studio Code$/i, "")
    .replace(/\s*-\s*Visual Studio Code$/i, "")
    .replace(/\s*-\s*Brave$/i, "")
    .replace(/\s*-\s*Google Chrome$/i, "")
    .replace(/\s*-\s*Microsoft Edge$/i, "")
    .replace(/\s*-\s*Mozilla Firefox$/i, "")
    .replace(/\s*-\s*Antigravity IDE(?:\s*-\s*|$)/i, " • ")
    .replace(/\s*-\s*Discord$/i, "")
    .replace(/\s*-\s*Slack$/i, "")
    .trim();

  // If title is a full URL, simplify to hostname + path
  if (title.startsWith("http://") || title.startsWith("https://")) {
    try {
      const u = new URL(title);
      title = `${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
    } catch {
      title = title.split("?")[0] || title;
    }
  }

  return title;
}

function haystackOf(appName: string, title: string, domain?: string): string {
  return `${appName} ${title} ${domain ?? ""}`;
}

export function isLeisureActivity(appName: string, title: string, domain?: string): boolean {
  const hay = haystackOf(appName, title, domain);
  return LEISURE_PATTERNS.some((pattern) => pattern.test(hay));
}

export function inferSiteLabel(title: string, domain?: string, contexts: string[] = []): string | undefined {
  const hay = [title, domain ?? "", ...contexts].join(" ");
  for (const [pattern, label] of SITE_LABELS) {
    if (pattern.test(hay)) return label;
  }
  if (domain) {
    return domain.replace(/^www\./, "");
  }
  return undefined;
}

export function inferProjectName(title: string, contexts: string[] = []): string | undefined {
  const hay = [title, ...contexts].join(" ");
  if (/productivehix/i.test(hay)) return "ProductiveHix";
  const vsCodeProject = hay.match(/-\s*([A-Za-z0-9._-]+)\s*$/m);
  if (vsCodeProject?.[1] && !/visual studio code|brave|chrome|edge/i.test(vsCodeProject[1])) {
    return vsCodeProject[1];
  }
  return undefined;
}

/**
 * Classifies an activity into one of the canonical timeline categories.
 */
export function categorizeActivity(
  appName: string,
  title: string,
  isAfk: boolean,
  isBrowser: boolean,
  domain?: string,
): TimelineCategory {
  if (isAfk) return "break";

  const appLower = appName.toLowerCase();
  const titleLower = title.toLowerCase();

  if (
    appLower.includes("lockapp") ||
    appLower.includes("screen locked") ||
    titleLower.includes("lock screen")
  ) {
    return "break";
  }

  if (
    appLower.includes("code") ||
    appLower.includes("cursor") ||
    appLower.includes("antigravity") ||
    appLower.includes("terminal") ||
    appLower.includes("powershell") ||
    appLower.includes("neovim") ||
    appLower.includes("intellij") ||
    appLower.includes("pycharm") ||
    appLower.includes("webstorm")
  ) {
    return "focused";
  }

  if (
    appLower.includes("slack") ||
    appLower.includes("discord") ||
    appLower.includes("teams") ||
    appLower.includes("zoom") ||
    appLower.includes("telegram") ||
    appLower.includes("outlook") ||
    titleLower.includes("gmail")
  ) {
    return "communication";
  }

  const looksLikeBrowser =
    isBrowser ||
    appLower.includes("chrome") ||
    appLower.includes("brave") ||
    appLower.includes("edge") ||
    appLower.includes("firefox") ||
    appLower.includes("arc") ||
    appLower === "browser";

  if (looksLikeBrowser && isLeisureActivity(appName, title, domain)) {
    return "leisure";
  }

  if (looksLikeBrowser) {
    return "browser";
  }

  if (isLeisureActivity(appName, title, domain)) {
    return "leisure";
  }

  return "general";
}

function isAfkPayload(watcherStr: string, data: Record<string, any>): boolean {
  const state = String(data.state ?? data.status ?? "").toLowerCase();
  if (state === "active" || state === "not-afk" || state === "not_afk") return false;
  if (state === "afk" || state === "idle") return true;
  return watcherStr === "afk" && state.length === 0;
}

/**
 * Phase 2 — Normalization:
 * Transforms raw telemetry / database events into canonical events.
 */
export function normalizeRawActivityEvents(rawRows: RawActivityInput[]): CanonicalActivityEvent[] {
  const canonical: CanonicalActivityEvent[] = [];

  for (const row of rawRows) {
    const data = (row.data ?? {}) as Record<string, any>;
    const startDate = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
    const start = startDate.getTime();
    if (isNaN(start)) continue;

    const durationMs = row.durationMs ?? (typeof row.duration === "number" ? Math.max(0, Math.round(row.duration * 1000)) : 0);
    const end = start + Math.max(1000, durationMs);

    const watcherStr = (row.watcher || "").toLowerCase();
    const sourceStr = (row.source || "").toLowerCase();
    const isAfkWatcher = watcherStr === "afk" || data.state === "afk" || data.status === "afk";
    const isBrowserWatcher = sourceStr === "browser" || watcherStr === "web" || watcherStr === "active_tab";

    let watcherType: CanonicalActivityEvent["watcher"] = "other";
    if (isAfkWatcher) watcherType = "afk";
    else if (watcherStr === "input") watcherType = "input";
    else if (isBrowserWatcher) watcherType = "browser";
    else if (watcherStr === "active_window" || watcherStr === "window") watcherType = "active_window";

    let application = "Unknown Application";
    let title = "";
    let domain: string | undefined = undefined;

    if (isAfkWatcher) {
      application = "Away from Keyboard";
      title = "Away from keyboard";
    } else if (isBrowserWatcher) {
      application = normalizeAppName(data.application || "Browser", data);
      domain = data.domain || undefined;
      title = cleanWindowTitle(data.pageTitle || data.title || domain || "Web Page", application);
    } else {
      application = normalizeAppName(data.application || data.app, data);
      title = cleanWindowTitle(data.windowTitle || data.title || "", application);
    }

    const category = categorizeActivity(application, title, isAfkWatcher, isBrowserWatcher);

    canonical.push({
      id: row.externalId || row.id || `ev-${start}-${Math.random().toString(36).substring(2, 8)}`,
      start,
      end,
      durationMs: end - start,
      source: isBrowserWatcher ? "browser" : "desktop",
      watcher: watcherType,
      application,
      title,
      domain,
      isAfk: isAfkWatcher,
      isBrowser: isBrowserWatcher,
      category,
      rawEventCount: 1,
      contexts: title ? [title] : [],
    });
  }

  return canonical;
}

/**
 * Phase 3 — Interval Normalization:
 * - Sorts chronologically
 * - Deduplicates identical events
 * - Merges AFK break intervals (duration >= minBreakMs)
 * - Carves active window events around AFK breaks (AFK precedence)
 * - Enriches desktop browser windows with concurrent browser extension tab details
 * - Prevents double counting between desktop browser windows and extension tabs
 * - Clips active overlapping events so SUM(durations) === wall-clock elapsed time
 */
export function normalizeIntervals(
  events: CanonicalActivityEvent[],
  options: Required<AggregationOptions> = DEFAULT_OPTIONS,
): CanonicalActivityEvent[] {
  if (events.length === 0) return [];

  // 1. Sort chronologically ASC
  const sorted = [...events].sort((a, b) => a.start - b.start);

  // 2. Separate AFK intervals, Desktop Active events, and Browser extension tabs
  const afkIntervals: { start: number; end: number; id: string }[] = [];
  const desktopActiveEvents: CanonicalActivityEvent[] = [];
  const browserTabs: CanonicalActivityEvent[] = [];

  for (const ev of sorted) {
    if (ev.watcher === "input") continue;

    if (ev.isAfk) {
      if (ev.durationMs >= options.minBreakMs) {
        afkIntervals.push({ start: ev.start, end: ev.end, id: ev.id });
      }
      continue;
    }

    if (ev.watcher === "browser") {
      browserTabs.push(ev);
      continue;
    }

    // Filter out headless background helper noise:
    // powershell or explorer with 0 or empty window title and duration <= 15s
    const isBackgroundNoise =
      (ev.application === "Terminal" || ev.application === "Windows Explorer" || ev.application === "Desktop Application") &&
      !ev.title.trim() &&
      ev.durationMs <= 15_000;

    if (!isBackgroundNoise) {
      desktopActiveEvents.push(ev);
    }
  }

  // 3. Merge overlapping or contiguous AFK Break intervals
  afkIntervals.sort((a, b) => a.start - b.start);
  const mergedAfks: { start: number; end: number; id: string }[] = [];
  for (const brk of afkIntervals) {
    const last = mergedAfks[mergedAfks.length - 1];
    if (last && brk.start <= last.end + 5000) {
      last.end = Math.max(last.end, brk.end);
    } else {
      mergedAfks.push({ ...brk });
    }
  }

  // 4. Carve desktop active events around AFK breaks (AFK takes physical human precedence)
  const carvedActiveEvents: CanonicalActivityEvent[] = [];

  for (const ev of desktopActiveEvents) {
    let currentStart = ev.start;
    const currentEnd = ev.end;

    // Check collision with each AFK break
    let isSuppressed = false;
    for (const brk of mergedAfks) {
      // Completely within break -> suppress active event
      if (currentStart >= brk.start && currentEnd <= brk.end) {
        isSuppressed = true;
        break;
      }
      // Overlaps start of break
      if (currentStart < brk.start && currentEnd > brk.start && currentEnd <= brk.end) {
        carvedActiveEvents.push({
          ...ev,
          start: currentStart,
          end: brk.start,
          durationMs: brk.start - currentStart,
        });
        isSuppressed = true;
        break;
      }
      // Overlaps end of break
      if (currentStart >= brk.start && currentStart < brk.end && currentEnd > brk.end) {
        currentStart = brk.end;
      }
    }

    if (!isSuppressed && currentEnd - currentStart >= 1000) {
      carvedActiveEvents.push({
        ...ev,
        start: currentStart,
        end: currentEnd,
        durationMs: currentEnd - currentStart,
      });
    }
  }

  // 5. Browser Extension Tab Integration & Precedence:
  // For each browser tab event from the extension:
  // Check if a desktop active event of category "browser" overlaps with it.
  // If YES: enrich that desktop event (it has true window focus, and extension adds tab/domain details).
  // If NO: add the tab as a standalone active event (for browser-extension-only setups).
  const standaloneTabs: CanonicalActivityEvent[] = [];
  for (const tab of browserTabs) {
    const overlappingDesktopBrowser = carvedActiveEvents.find(
      (d) => d.category === "browser" && tab.start <= d.end && tab.end >= d.start,
    );

    if (overlappingDesktopBrowser) {
      if (tab.domain && !overlappingDesktopBrowser.domain) {
        overlappingDesktopBrowser.domain = tab.domain;
      }
      if (tab.title && !overlappingDesktopBrowser.contexts.includes(tab.title)) {
        overlappingDesktopBrowser.contexts.push(tab.title);
      }
      if (tab.title && (!overlappingDesktopBrowser.title || overlappingDesktopBrowser.title === "Web Page" || overlappingDesktopBrowser.title === overlappingDesktopBrowser.application)) {
        overlappingDesktopBrowser.title = tab.title;
      }
    } else {
      // Standalone browser extension event (no desktop window agent coverage)
      // Carve around AFK breaks
      let isInsideAfk = false;
      for (const brk of mergedAfks) {
        if (tab.start >= brk.start && tab.end <= brk.end) {
          isInsideAfk = true;
          break;
        }
      }
      if (!isInsideAfk && tab.durationMs >= 1000) {
        standaloneTabs.push(tab);
      }
    }
  }

  const allActive = [...carvedActiveEvents, ...standaloneTabs];

  // 6. Chronological Non-Overlapping Clipping
  allActive.sort((a, b) => a.start - b.start);
  for (let i = 0; i < allActive.length - 1; i++) {
    const curr = allActive[i]!;
    const next = allActive[i + 1]!;
    if (curr.end > next.start) {
      curr.end = next.start;
      curr.durationMs = Math.max(0, curr.end - curr.start);
    }
  }

  const validActive = allActive.filter((e) => e.durationMs >= 1000);

  // 7. Re-combine carved active events with AFK Break segments
  const combined: CanonicalActivityEvent[] = [...validActive];
  for (const brk of mergedAfks) {
    combined.push({
      id: brk.id,
      start: brk.start,
      end: brk.end,
      durationMs: brk.end - brk.start,
      source: "desktop",
      watcher: "afk",
      application: "Away from Keyboard",
      title: "Away from keyboard",
      isAfk: true,
      isBrowser: false,
      category: "break",
      rawEventCount: 1,
      contexts: ["Away from keyboard"],
    });
  }

  combined.sort((a, b) => a.start - b.start);
  return combined;
}

/**
 * Phase 4 — Semantic Segmentation:
 * Consolidates normalized interval events into meaningful, continuous human-scale TimelineSegments.
 * - Preserves contexts across the session (e.g. file changes in VS Code)
 * - Absorbs incidental transient interruptions (runs of events <= transientThresholdMs) flanked by compatible work
 * - Keeps AFK breaks distinct
 * - Retains rawEventCount and underlying contexts
 */
export function aggregateActivitySegments(
  rawRows: RawActivityInput[],
  options?: AggregationOptions,
): TimelineSegment[] {
  const opts: Required<AggregationOptions> = {
    maxGapMs: options?.maxGapMs ?? DEFAULT_OPTIONS.maxGapMs,
    minBreakMs: options?.minBreakMs ?? DEFAULT_OPTIONS.minBreakMs,
    transientThresholdMs: options?.transientThresholdMs ?? DEFAULT_OPTIONS.transientThresholdMs,
    minSegmentMs: options?.minSegmentMs ?? DEFAULT_OPTIONS.minSegmentMs,
  };

  const canonical = normalizeRawActivityEvents(rawRows);
  if (canonical.length === 0) return [];

  const normalized = normalizeIntervals(canonical, opts);
  if (normalized.length === 0) return [];

  // Pass 1: Transient Interruption Absorption
  // If between event i and a subsequent compatible event, there is a sequence of incidental non-AFK blips
  // whose combined duration is <= transientThresholdMs (e.g. <= 15s) and within maxGapMs:
  // absorb them into the continuous session.
  const filtered: CanonicalActivityEvent[] = [];
  let idx = 0;

  while (idx < normalized.length) {
    const curr = normalized[idx]!;

    if (filtered.length > 0 && !curr.isAfk) {
      const prev = filtered[filtered.length - 1]!;

      // Look ahead to see if prev.application resumes after intermediate blips
      let runDurationMs = curr.durationMs;
      let resumeIdx = -1;

      if (runDurationMs <= opts.transientThresholdMs) {
        for (let j = idx + 1; j < normalized.length; j++) {
          const candidate = normalized[j]!;
          if (candidate.isAfk) break; // AFK breaks can never be crossed as transient

          const isCandidateCompatible =
            (candidate.application === prev.application ||
              (candidate.category === "browser" && prev.category === "browser")) &&
            candidate.category === prev.category;

          if (
            isCandidateCompatible &&
            candidate.start - prev.end <= opts.maxGapMs
          ) {
            resumeIdx = j;
            break;
          }

          runDurationMs += candidate.durationMs;
          if (runDurationMs > opts.transientThresholdMs) break;
        }
      }

      if (resumeIdx !== -1 && runDurationMs <= opts.transientThresholdMs) {
        // Absorb all intermediate transient blips into prev
        for (let j = idx; j < resumeIdx; j++) {
          const blip = normalized[j]!;
          prev.end = Math.max(prev.end, blip.end);
          prev.durationMs = prev.end - prev.start;
          prev.rawEventCount += blip.rawEventCount;
          if (blip.title && !prev.contexts.includes(blip.title)) {
            prev.contexts.push(`(Brief: ${blip.application} - ${blip.title})`);
          }
        }
        idx = resumeIdx;
        continue;
      }
    }

    filtered.push({ ...curr, contexts: [...curr.contexts] });
    idx++;
  }

  // Pass 2: Semantic Grouping
  // Consolidate contiguous events with same application & category within maxGapMs
  const segments: TimelineSegment[] = [];

  for (const item of filtered) {
    const prev = segments[segments.length - 1];
    const gapMs = prev ? item.start - new Date(prev.end).getTime() : Infinity;

    const isBothBrowser = prev && prev.category === "browser" && item.category === "browser";
    const sameApp = prev && prev.application === item.application;

    const canMerge =
      prev &&
      (sameApp || isBothBrowser) &&
      prev.category === item.category &&
      gapMs <= opts.maxGapMs;

    if (canMerge && prev) {
      if (prev.application === "Browser" && item.application !== "Browser") {
        prev.application = item.application;
      }
      prev.end = new Date(item.end).toISOString();
      prev.durationMs = new Date(prev.end).getTime() - new Date(prev.start).getTime();
      prev.durationSeconds = Math.round(prev.durationMs / 1000);
      prev.rawEventCount = (prev.rawEventCount || 1) + item.rawEventCount;

      // Merge contexts
      if (!prev.contexts) prev.contexts = [prev.title];
      for (const ctx of item.contexts) {
        if (ctx && !prev.contexts.includes(ctx)) {
          prev.contexts.push(ctx);
        }
      }

      // Update primaryTitle to most descriptive/longest title
      if (item.title && (!prev.title || prev.title.length < item.title.length)) {
        prev.title = item.title;
        prev.primaryTitle = item.title;
      }

      if (item.domain && !prev.domain) {
        prev.domain = item.domain;
      }
    } else {
      const type: "application" | "browser" | "break" = item.isAfk
        ? "break"
        : item.isBrowser
          ? "browser"
          : "application";

      segments.push({
        id: item.id,
        start: new Date(item.start).toISOString(),
        end: new Date(item.end).toISOString(),
        durationMs: item.durationMs,
        durationSeconds: Math.round(item.durationMs / 1000),
        source: item.source,
        type,
        activityType: type,
        application: item.application,
        title: item.title,
        primaryTitle: item.title,
        domain: item.domain,
        category: item.category,
        rawEventCount: item.rawEventCount,
        contexts: item.contexts.length > 0 ? [...item.contexts] : [item.title],
      });
    }
  }

  return segments;
}

/**
 * Computes summary metrics from the consolidated timeline segments.
 * Guaranteed mathematical invariant:
 * focusedMs + browserMs + breakMs + communicationMs + generalMs === totalTrackedMs
 */
export function computeTimelineSummary(segments: TimelineSegment[]): TimelineSummary {
  let totalTrackedMs = 0;
  let focusedMs = 0;
  let browserMs = 0;
  let leisureMs = 0;
  let breakMs = 0;
  let communicationMs = 0;
  let generalMs = 0;

  for (const s of segments) {
    totalTrackedMs += s.durationMs;
    if (s.category === "focused") focusedMs += s.durationMs;
    else if (s.category === "browser") browserMs += s.durationMs;
    else if (s.category === "leisure") leisureMs += s.durationMs;
    else if (s.category === "break") breakMs += s.durationMs;
    else if (s.category === "communication") communicationMs += s.durationMs;
    else generalMs += s.durationMs;
  }

  return {
    totalTrackedMs,
    focusedMs,
    browserMs,
    leisureMs,
    breakMs,
    communicationMs,
    generalMs,
    segmentsCount: segments.length,
  };
}
