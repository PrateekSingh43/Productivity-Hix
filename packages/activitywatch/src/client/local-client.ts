import type {
  ActivityWatchBucket,
  ActivityWatchEvent,
  ActivityWatchInfo,
} from "../parsing/events";

export type EventQueryOptions = {
  start?: string | Date;
  end?: string | Date;
  limit?: number;
};

export class ActivityWatchLocalClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: { port?: number; baseUrl?: string; timeoutMs?: number }) {
    if (options?.baseUrl) {
      this.baseUrl = options.baseUrl.replace(/\/$/, "");
    } else {
      const port = options?.port ?? 5600;
      this.baseUrl = `http://127.0.0.1:${port}`;
    }
    this.timeoutMs = options?.timeoutMs ?? 3000;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.getInfo();
      return true;
    } catch {
      return false;
    }
  }

  async getInfo(): Promise<ActivityWatchInfo> {
    return this.request<ActivityWatchInfo>("/api/0/info");
  }

  async getBuckets(): Promise<Record<string, ActivityWatchBucket>> {
    // Note: trailing slash prevents 308 redirect in aw-server
    return this.request<Record<string, ActivityWatchBucket>>("/api/0/buckets/");
  }

  async getEvents<T = Record<string, unknown>>(
    bucketId: string,
    options?: EventQueryOptions,
  ): Promise<ActivityWatchEvent<T>[]> {
    const params = new URLSearchParams();
    if (options?.start) {
      const startStr =
        options.start instanceof Date ? options.start.toISOString() : options.start;
      params.set("start", startStr);
    }
    if (options?.end) {
      const endStr = options.end instanceof Date ? options.end.toISOString() : options.end;
      params.set("end", endStr);
    }
    if (options?.limit !== undefined) {
      params.set("limit", options.limit.toString());
    }

    const qs = params.toString();
    const path = `/api/0/buckets/${encodeURIComponent(bucketId)}/events${qs ? `?${qs}` : ""}`;
    return this.request<ActivityWatchEvent<T>[]>(path);
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `ActivityWatch request failed with HTTP ${response.status} (${response.statusText}): ${path}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`ActivityWatch request timed out after ${this.timeoutMs}ms: ${path}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
