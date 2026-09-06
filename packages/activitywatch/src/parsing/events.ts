export type ActivityWatchInfo = {
  hostname: string;
  version: string;
  testing: boolean;
  device_id?: string;
};

export type ActivityWatchBucket = {
  id: string;
  created: string;
  name: string | null;
  type: string;
  client: string;
  hostname: string;
  data: Record<string, unknown>;
  last_updated: string;
};

export type ActivityWatchEvent<T = Record<string, unknown>> = {
  id?: number;
  timestamp: string;
  duration: number; // Duration in seconds (float)
  data: T;
};

export type ActivityWatchWindowEventData = {
  app: string;
  title: string;
};

export type ActivityWatchAfkEventData = {
  status: "afk" | "not-afk";
};

export type ActivityWatchInputEventData = {
  presses?: number;
  clicks?: number;
  movement?: number;
};

export function isWindowEvent(
  event: ActivityWatchEvent,
): event is ActivityWatchEvent<ActivityWatchWindowEventData> {
  return typeof event.data?.app === "string" && typeof event.data?.title === "string";
}

export function isAfkEvent(
  event: ActivityWatchEvent,
): event is ActivityWatchEvent<ActivityWatchAfkEventData> {
  return event.data?.status === "afk" || event.data?.status === "not-afk";
}
