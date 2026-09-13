export class DeduplicationFilter {
  private readonly maxEntries: number;
  private readonly seen: Map<string, number> = new Map();
  private readonly idOrder: string[] = [];

  constructor(maxEntries = 5000) {
    this.maxEntries = maxEntries;
  }

  has(eventId: string, durationMs = 0): boolean {
    const prev = this.seen.get(eventId);
    if (prev === undefined) return false;
    // If duration has expanded by > 1s, it is an updated event, not a duplicate
    return durationMs <= prev + 1000;
  }

  add(eventId: string, durationMs = 0): void {
    if (this.seen.has(eventId)) {
      this.seen.set(eventId, Math.max(this.seen.get(eventId) ?? 0, durationMs));
      return;
    }

    this.seen.set(eventId, durationMs);
    this.idOrder.push(eventId);

    if (this.idOrder.length > this.maxEntries) {
      const oldest = this.idOrder.shift();
      if (oldest) {
        this.seen.delete(oldest);
      }
    }
  }

  filterNew<T extends { eventId: string; durationMs?: number }>(events: T[]): T[] {
    const fresh: T[] = [];
    for (const ev of events) {
      const dur = ev.durationMs ?? 0;
      if (!this.has(ev.eventId, dur)) {
        this.add(ev.eventId, dur);
        fresh.push(ev);
      }
    }
    return fresh;
  }
}
