export type CollectorProvenance = {
  collector: "activitywatch" | "browser-extension";
  collectorName?: string;
  bucketId?: string;
  version?: string;
  hostname?: string;
};
