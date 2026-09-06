export type BridgeStatus = {
  bridgeVersion: string;
  bridgeRunning: boolean;
  apiReachable: boolean;
  devicePaired: boolean;
  queueSize: number;
  lastSyncAt?: string;
  eventsSyncedTotal: number;
};

export class BridgeStatusTracker {
  private status: BridgeStatus = {
    bridgeVersion: "0.2.0",
    bridgeRunning: true,
    apiReachable: false,
    devicePaired: false,
    queueSize: 0,
    eventsSyncedTotal: 0,
  };

  getStatus(): BridgeStatus {
    return { ...this.status };
  }

  update(partial: Partial<BridgeStatus>): void {
    this.status = { ...this.status, ...partial };
  }

  recordSyncSuccess(count: number): void {
    this.status.lastSyncAt = new Date().toISOString();
    this.status.eventsSyncedTotal += count;
  }
}
