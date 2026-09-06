import type { BrowserActivityEvent } from "@repo/telemetry";

const QUEUE_KEY = "productivehix_extension_queue";
const MAX_QUEUE_SIZE = 2000;

export class ExtensionQueue {
  async enqueue(events: BrowserActivityEvent[]): Promise<number> {
    if (events.length === 0) return 0;

    const existing = await this.getAll();
    const updated = [...existing, ...events];

    // Bound queue size
    const bounded = updated.length > MAX_QUEUE_SIZE ? updated.slice(updated.length - MAX_QUEUE_SIZE) : updated;

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [QUEUE_KEY]: bounded });
    }

    return events.length;
  }

  async getAll(): Promise<BrowserActivityEvent[]> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return [];
    }
    const data = await chrome.storage.local.get(QUEUE_KEY);
    return (data[QUEUE_KEY] as BrowserActivityEvent[]) || [];
  }

  async peek(limit = 50): Promise<BrowserActivityEvent[]> {
    const all = await this.getAll();
    return all.slice(0, limit);
  }

  async acknowledge(eventIds: string[]): Promise<number> {
    const ackSet = new Set(eventIds);
    const existing = await this.getAll();
    const remaining = existing.filter((e) => !ackSet.has(e.eventId));

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [QUEUE_KEY]: remaining });
    }

    return existing.length - remaining.length;
  }

  async size(): Promise<number> {
    const all = await this.getAll();
    return all.length;
  }
}
