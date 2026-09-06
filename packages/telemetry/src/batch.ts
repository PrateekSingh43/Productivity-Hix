import type { TelemetryEvent } from "./events";

export type TelemetryBatch = {
  installationId: string;
  source: "desktop" | "browser";
  sentAt: string;
  events: TelemetryEvent[];
};

export type BatchIngestionResult = {
  accepted: number;
  duplicates: number;
  rejected: number;
};

export function deduplicateEvents(events: TelemetryEvent[]): TelemetryEvent[] {
  const seen = new Set<string>();
  const unique: TelemetryEvent[] = [];
  for (const event of events) {
    if (!seen.has(event.eventId)) {
      seen.add(event.eventId);
      unique.push(event);
    }
  }
  return unique;
}
