import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { TelemetryEvent } from "@repo/telemetry";

export class DurableQueue {
  private readonly queueFile: string;
  private readonly maxQueueSize: number;

  constructor(options?: { customPath?: string; maxQueueSize?: number }) {
    this.maxQueueSize = options?.maxQueueSize ?? 10000;
    if (options?.customPath) {
      this.queueFile = options.customPath;
    } else {
      const baseDir = path.join(os.homedir(), ".productivehix", "queue");
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.queueFile = path.join(baseDir, "pending_events.jsonl");
    }
  }

  async enqueue(events: TelemetryEvent[]): Promise<number> {
    if (events.length === 0) return 0;

    const currentCount = this.size();
    if (currentCount >= this.maxQueueSize) {
      console.warn(`Queue reached max limit (${this.maxQueueSize}). Dropping oldest events.`);
      await this.dropOldest(Math.floor(this.maxQueueSize * 0.1)); // Drop 10% oldest to preserve recent
    }

    const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.appendFileSync(this.queueFile, lines, "utf-8");
    return events.length;
  }

  peek(limit = 50): TelemetryEvent[] {
    if (!fs.existsSync(this.queueFile)) return [];

    const content = fs.readFileSync(this.queueFile, "utf-8");
    if (!content.trim()) return [];

    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const events: TelemetryEvent[] = [];

    for (let i = 0; i < Math.min(lines.length, limit); i++) {
      try {
        events.push(JSON.parse(lines[i]));
      } catch (err) {
        console.error("Malformed JSON line in queue:", err);
      }
    }

    return events;
  }

  acknowledge(eventIds: string[]): number {
    if (eventIds.length === 0 || !fs.existsSync(this.queueFile)) return 0;

    const ackSet = new Set(eventIds);
    const content = fs.readFileSync(this.queueFile, "utf-8");
    if (!content.trim()) return 0;

    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const remaining: string[] = [];
    let removedCount = 0;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { eventId: string };
        if (ackSet.has(parsed.eventId)) {
          removedCount++;
        } else {
          remaining.push(line);
        }
      } catch {
        // Drop malformed lines on acknowledge
        removedCount++;
      }
    }

    const tmpFile = `${this.queueFile}.tmp`;
    const newContent = remaining.length > 0 ? remaining.join("\n") + "\n" : "";
    fs.writeFileSync(tmpFile, newContent, "utf-8");
    fs.renameSync(tmpFile, this.queueFile);

    return removedCount;
  }

  size(): number {
    if (!fs.existsSync(this.queueFile)) return 0;
    const content = fs.readFileSync(this.queueFile, "utf-8");
    if (!content.trim()) return 0;
    return content.split("\n").filter((l) => l.trim().length > 0).length;
  }

  clear(): void {
    if (fs.existsSync(this.queueFile)) {
      fs.writeFileSync(this.queueFile, "", "utf-8");
    }
  }

  private dropOldest(count: number): void {
    if (!fs.existsSync(this.queueFile)) return;
    const content = fs.readFileSync(this.queueFile, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const remaining = lines.slice(count);
    const tmpFile = `${this.queueFile}.tmp`;
    fs.writeFileSync(tmpFile, remaining.join("\n") + "\n", "utf-8");
    fs.renameSync(tmpFile, this.queueFile);
  }
}
