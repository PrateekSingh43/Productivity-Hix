import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export class SyncCursorManager {
  private readonly filePath: string;
  private cursors: Record<string, string> = {};

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const baseDir = path.join(os.homedir(), ".productivehix");
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.filePath = path.join(baseDir, "sync_cursor.json");
    }
    this.load();
  }

  getCursor(bucketId: string): string | undefined {
    return this.cursors[bucketId];
  }

  /**
   * Only advance the cursor when events are confirmed safely written to the durable queue
   */
  setCursor(bucketId: string, timestamp: string): void {
    const existing = this.cursors[bucketId];
    if (!existing || new Date(timestamp).getTime() > new Date(existing).getTime()) {
      this.cursors[bucketId] = timestamp;
      this.save();
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.cursors = JSON.parse(raw);
      }
    } catch {
      this.cursors = {};
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.cursors, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.filePath);
    } catch (error) {
      console.error("Failed to persist sync cursor:", error);
    }
  }
}
