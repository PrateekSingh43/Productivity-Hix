import type { CheckInCreateInput } from "@repo/validation";
import type { CheckIn } from "@repo/types";
import { apiClient } from "../api/client";

export type QueuedCheckIn = {
  clientQueueId: string;
  payload: CheckInCreateInput;
  createdAt: string;
  retries: number;
};

const STORAGE_KEY = "productivehix_pending_checkins";

export class CheckInQueue {
  async getQueue(): Promise<QueuedCheckIn[]> {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return (data[STORAGE_KEY] as QueuedCheckIn[]) || [];
  }

  async enqueue(input: CheckInCreateInput): Promise<string> {
    const queue = await this.getQueue();
    const clientQueueId = `chk_q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const item: QueuedCheckIn = {
      clientQueueId,
      payload: input,
      createdAt: new Date().toISOString(),
      retries: 0,
    };
    queue.push(item);
    await chrome.storage.local.set({ [STORAGE_KEY]: queue });
    return clientQueueId;
  }

  async remove(clientQueueId: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((q) => q.clientQueueId !== clientQueueId);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  }

  async count(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  /**
   * Attempts to flush all pending check-ins to the API.
   * Returns successfully submitted check-ins.
   */
  async flush(): Promise<{ flushed: number; failed: number }> {
    const reachable = await apiClient.isReachable();
    if (!reachable) {
      return { flushed: 0, failed: 0 };
    }

    const queue = await this.getQueue();
    if (queue.length === 0) return { flushed: 0, failed: 0 };

    let flushed = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        const response = await apiClient.request<CheckIn>("/api/check-ins", {
          method: "POST",
          body: JSON.stringify(item.payload),
        });

        if (response?.id) {
          await this.remove(item.clientQueueId);
          flushed++;
        } else {
          item.retries += 1;
          failed++;
        }
      } catch (err) {
        console.warn(`[CHECKIN QUEUE] Failed to flush item ${item.clientQueueId}:`, err);
        item.retries += 1;
        failed++;
      }
    }

    return { flushed, failed };
  }
}

export const checkInQueue = new CheckInQueue();
