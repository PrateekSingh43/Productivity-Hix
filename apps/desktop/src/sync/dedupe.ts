export class DeduplicationFilter {
  private readonly maxEntries: number;
  private readonly seenIds: Set<string> = new Set();
  private readonly idOrder: string[] = [];

  constructor(maxEntries = 5000) {
    this.maxEntries = maxEntries;
  }

  has(eventId: string): boolean {
    return this.seenIds.has(eventId);
  }

  add(eventId: string): void {
    if (this.seenIds.has(eventId)) return;

    this.seenIds.add(eventId);
    this.idOrder.push(eventId);

    if (this.idOrder.length > this.maxEntries) {
      const oldest = this.idOrder.shift();
      if (oldest) {
        this.seenIds.delete(oldest);
      }
    }
  }

  filterNew<T extends { eventId: string }>(events: T[]): T[] {
    const fresh: T[] = [];
    for (const ev of events) {
      if (!this.has(ev.eventId)) {
        this.add(ev.eventId);
        fresh.push(ev);
      }
    }
    return fresh;
  }
}
