import type { TelemetryBatch, BatchIngestionResult } from "@repo/telemetry";

export class ApiTelemetryClient {
  private readonly apiUrl: string;
  private deviceToken: string | null = null;
  private devUserId: string | null = null;

  constructor(options?: { apiUrl?: string; deviceToken?: string; devUserId?: string }) {
    this.apiUrl = (
      options?.apiUrl ||
      process.env.PRODUCTIVEHIX_API_URL ||
      "http://localhost:4000"
    ).replace(/\/$/, "");
    this.deviceToken = options?.deviceToken || process.env.PRODUCTIVEHIX_DEVICE_TOKEN || null;
    this.devUserId = options?.devUserId || process.env.PRODUCTIVEHIX_DEV_USER_ID || null;
  }

  setDeviceToken(token: string): void {
    this.deviceToken = token;
  }

  setDevUserId(userId: string): void {
    this.devUserId = userId;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  async uploadBatch(batch: TelemetryBatch): Promise<BatchIngestionResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.deviceToken) {
      headers["Authorization"] = `Bearer ${this.deviceToken}`;
      headers["x-device-token"] = this.deviceToken;
    } else if (this.devUserId) {
      headers["x-user-id"] = this.devUserId;
    }

    const response = await fetch(`${this.apiUrl}/api/telemetry/batch`, {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API telemetry upload failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as BatchIngestionResult;
  }

  async isReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/api/health`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }
}
