import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { exec } from "node:child_process";

export type DeviceCredentials = {
  deviceId: string;
  deviceToken: string;
  userId: string;
  hostname: string;
  pairedAt: string;
};

export type DeviceCodeResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

export class DevicePairingManager {
  private readonly apiUrl: string;
  private readonly credentialsFile: string;
  private credentials: DeviceCredentials | null = null;

  constructor(apiUrl?: string, customPath?: string) {
    this.apiUrl = (
      apiUrl ||
      process.env.PRODUCTIVEHIX_API_URL ||
      "http://localhost:4000"
    ).replace(/\/$/, "");

    if (customPath) {
      this.credentialsFile = customPath;
    } else {
      const baseDir = path.join(os.homedir(), ".productivehix");
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.credentialsFile = path.join(baseDir, "device.json");
    }

    this.load();
  }

  isPaired(): boolean {
    return this.credentials !== null && !!this.credentials.deviceToken;
  }

  getCredentials(): DeviceCredentials | null {
    return this.credentials;
  }

  getInstallationId(): string {
    return this.credentials?.deviceId ?? `dev-unpaired-${os.hostname()}`;
  }

  getDeviceToken(): string | undefined {
    return this.credentials?.deviceToken;
  }

  async pairDevice(clientName = "ProductiveHix Desktop Bridge"): Promise<DeviceCredentials> {
    if (this.isPaired() && this.credentials) {
      return this.credentials;
    }

    console.log("Device is not paired. Initiating RFC 8628 pairing flow...");
    const codeRes = await this.requestDeviceCode(clientName);

    console.log("==================================================");
    console.log("         PRODUCTIVEHIX DEVICE PAIRING             ");
    console.log("==================================================");
    console.log(`Pairing Code:   ${codeRes.userCode}`);
    console.log(`Authorize URL:  ${codeRes.verificationUriComplete}`);
    console.log("Opening your browser to confirm device authorization...");
    console.log("==================================================");

    this.openBrowser(codeRes.verificationUriComplete);

    const creds = await this.pollForToken(
      codeRes.deviceCode,
      codeRes.interval || 2,
      codeRes.expiresIn || 900,
    );

    this.credentials = creds;
    this.save();
    console.log("Device pairing successful! Token saved locally.");
    return creds;
  }

  private async requestDeviceCode(clientName: string): Promise<DeviceCodeResponse> {
    const res = await fetch(`${this.apiUrl}/api/auth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        platform: "windows",
        hostname: os.hostname(),
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to request device pairing code: HTTP ${res.status}`);
    }

    return (await res.json()) as DeviceCodeResponse;
  }

  private async pollForToken(
    deviceCode: string,
    intervalSec: number,
    expiresInSec: number,
  ): Promise<DeviceCredentials> {
    const startTime = Date.now();
    const timeoutMs = expiresInSec * 1000;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, intervalSec * 1000));

      const res = await fetch(`${this.apiUrl}/api/auth/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode }),
      });

      if (res.status === 200) {
        return (await res.json()) as DeviceCredentials;
      }

      if (res.status === 428 || res.status === 400) {
        const body = (await res.json()) as { error?: string };
        if (body.error === "authorization_pending") {
          // Keep polling
          continue;
        }
        if (body.error === "slow_down") {
          intervalSec += 2;
          continue;
        }
        throw new Error(`Pairing error: ${body.error}`);
      }

      throw new Error(`Unexpected token endpoint response: ${res.status}`);
    }

    throw new Error("Device authorization code expired.");
  }

  private openBrowser(url: string): void {
    const startCmd =
      process.platform === "win32"
        ? `start "" "${url}"`
        : process.platform === "darwin"
          ? `open "${url}"`
          : `xdg-open "${url}"`;
    exec(startCmd, () => {});
  }

  private load(): void {
    try {
      if (fs.existsSync(this.credentialsFile)) {
        const raw = fs.readFileSync(this.credentialsFile, "utf-8");
        this.credentials = JSON.parse(raw);
      }
    } catch {
      this.credentials = null;
    }
  }

  private save(): void {
    try {
      if (!this.credentials) return;
      const tmp = `${this.credentialsFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.credentials, null, 2), "utf-8");
      fs.renameSync(tmp, this.credentialsFile);
    } catch (err) {
      console.error("Failed to save device credentials:", err);
    }
  }
}
