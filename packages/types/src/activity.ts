export type ActivitySource = "desktop" | "browser" | "unknown";
export type ActivityWatcher = "window" | "web" | "afk" | "input" | "unknown";

export type ActivityEvent = {
  id?: string;
  bucketId: string;
  timestamp: string;
  duration: number;
  data: Record<string, unknown>;
};

export type NormalizedActivityEvent = ActivityEvent & {
  externalId: string;
  source: ActivitySource;
  watcher: ActivityWatcher;
};

export type ActivitySummary = {
  activeTime: number;
  idleTime: number;
  codingTime: number;
  browserTime: number;
  applicationTime: number;
  sessions: number;
};
