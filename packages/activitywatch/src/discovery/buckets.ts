import type { ActivityWatchBucket } from "../parsing/events";
import type { ActivityWatchLocalClient } from "../client/local-client";

export type DiscoveredBuckets = {
  windowBucket?: ActivityWatchBucket;
  afkBucket?: ActivityWatchBucket;
  inputBucket?: ActivityWatchBucket;
  /** Discovered aw-watcher-web buckets. Note: Not ingested in production pipeline; Browser Extension owns browser telemetry exclusively. */
  browserBuckets: ActivityWatchBucket[];
  allBuckets: Record<string, ActivityWatchBucket>;
};

export function findWindowBucket(
  buckets: Record<string, ActivityWatchBucket>,
): ActivityWatchBucket | undefined {
  return Object.values(buckets).find(
    (b) =>
      b.type === "currentwindow" ||
      b.client === "aw-watcher-window" ||
      b.id.startsWith("aw-watcher-window"),
  );
}

export function findAfkBucket(
  buckets: Record<string, ActivityWatchBucket>,
): ActivityWatchBucket | undefined {
  return Object.values(buckets).find(
    (b) =>
      b.type === "afkstatus" ||
      b.client === "aw-watcher-afk" ||
      b.id.startsWith("aw-watcher-afk"),
  );
}

export function findInputBucket(
  buckets: Record<string, ActivityWatchBucket>,
): ActivityWatchBucket | undefined {
  return Object.values(buckets).find(
    (b) =>
      b.type === "os.hid.input" ||
      b.client === "aw-watcher-input" ||
      b.id.startsWith("aw-watcher-input"),
  );
}

export async function discoverBuckets(
  client: ActivityWatchLocalClient,
): Promise<DiscoveredBuckets> {
  const allBuckets = await client.getBuckets();
  const windowBucket = findWindowBucket(allBuckets);
  const afkBucket = findAfkBucket(allBuckets);
  const inputBucket = findInputBucket(allBuckets);
  const browserBuckets = Object.values(allBuckets).filter(
    (b) =>
      b.type === "web.tab.current" ||
      b.client?.startsWith("aw-watcher-web") ||
      b.id.startsWith("aw-watcher-web"),
  );

  return {
    windowBucket,
    afkBucket,
    inputBucket,
    browserBuckets,
    allBuckets,
  };
}
