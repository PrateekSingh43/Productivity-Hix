import type { LearningAssessment, Task, WorkSession, CheckIn, CheckInPatternCandidate } from "@repo/types";
import type { ActivitySummary } from "@repo/types";
import type { TelemetryBatch, BatchIngestionResult } from "@repo/telemetry";
import type { CheckInCreateInput } from "@repo/validation";
import { getSettings } from "../storage/settings";

export class ExtensionApiClient {
  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const settings = await getSettings();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.deviceToken) {
      headers["x-device-token"] = settings.deviceToken;
      headers.Authorization = `Bearer ${settings.deviceToken}`;
    } else if (settings.userId) {
      headers["x-user-id"] = settings.userId;
    }
    const response = await fetch(`${settings.apiUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
      body: init?.body && typeof init.body === "object" && !(init.body instanceof FormData)
        ? JSON.stringify(init.body)
        : init?.body,
    });
    if (!response.ok) throw new Error(`API request failed (${response.status})`);
    return response.json() as Promise<T>;
  }

  getTasks() { return this.request<Task[]>("/api/tasks"); }
  getSessions() { return this.request<WorkSession[]>("/api/sessions"); }
  getAssessments() { return this.request<LearningAssessment[]>("/api/learning/assessments"); }
  getTodaySummary() { return this.request<ActivitySummary>("/api/activity/summary"); }
  getCheckIns() { return this.request<CheckIn[]>("/api/check-ins"); }
  getCheckInPatterns() { return this.request<CheckInPatternCandidate[]>("/api/check-ins/patterns"); }
  
  updateTask(id: string, data: { status?: Task["status"]; title?: string }) {
    return this.request<Task>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  startSession(taskId?: string, durationMinutes?: number) {
    return this.request<WorkSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        taskId: taskId ?? null,
        source: "extension_focus",
        notes: durationMinutes ? `Focus session: ${durationMinutes}m` : null,
      }),
    });
  }

  finishSession(id: string) {
    return this.request<WorkSession>(`/api/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ endedAt: new Date().toISOString() }),
    });
  }

  submitLearningAnswer(questionId: string, answer: string, score: number) {
    return this.request("/api/learning/answers", {
      method: "POST",
      body: JSON.stringify({ questionId, answer, score }),
    });
  }

  async exportData(): Promise<any> {
    return this.request("/api/export");
  }

  uploadBatch(batch: TelemetryBatch) {
    return this.request<BatchIngestionResult>("/api/telemetry/batch", {
      method: "POST",
      body: JSON.stringify(batch),
    });
  }

  async isReachable() {
    const settings = await getSettings();
    try {
      const response = await fetch(`${settings.apiUrl.replace(/\/$/, "")}/api/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const apiClient = new ExtensionApiClient();

export type ExtensionStatus = {
  installationId: string;
  authenticated: boolean;
  deviceToken?: string;
  trackingPaused: boolean;
  eventsCreated: number;
  eventsQueued: number;
  eventsUploaded: number;
  lastEvent?: {
    domain: string;
    pageTitle: string;
    timestamp: string;
    eventId: string;
    durationMs?: number;
  } | null;
  lastUpload?: {
    timestamp: string;
    count: number;
    status: number;
  } | null;
  queueSize: number;
  apiReachable: boolean;
  desktop: {
    connected: boolean;
    paired: boolean;
    version?: string;
    activityWatchRunning?: boolean;
  };
  currentActivity: { domain: string; pageTitle: string; durationMs: number } | null;
  scheduler?: {
    lastCompletedCheckIn: string | null;
    lastNotificationSentAt: string | null;
    lastNotificationClickedAt: string | null;
    lastCheckInOpenedAt: string | null;
    lastEligibleActivityAt: string | null;
    checkInCooldownUntil: string | null;
    checkInsPaused: boolean;
    activeSecondsInWindow: number;
    notificationsSentCount: number;
    checkInsCompletedCount: number;
    dominantDomain: string | null;
    devMode: boolean;
    devIntervalSeconds: number;
    customIntervalSeconds?: number;
    nextTriggerAt?: number | null;
    remainingSecondsUntilTrigger?: number;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    afterFocusReflection: boolean;
    eligibility?: { eligible: boolean; reason: string; nextCheckInMs?: number; remainingSeconds?: number };
    pendingCheckIns?: number;
  };
};

export function getExtensionStatus() {
  return chrome.runtime.sendMessage({ type: "get-status" }) as Promise<ExtensionStatus>;
}

export function setTrackingPaused(trackingPaused: boolean) {
  return chrome.runtime.sendMessage({ type: "set-tracking", trackingPaused }) as Promise<ExtensionStatus>;
}

export function triggerSync() {
  return chrome.runtime.sendMessage({ type: "trigger-sync" }) as Promise<ExtensionStatus>;
}

export function triggerAuth() {
  return chrome.runtime.sendMessage({ type: "trigger-auth" }) as Promise<ExtensionStatus>;
}

export function triggerCheckInNotification() {
  return chrome.runtime.sendMessage({ type: "trigger-checkin-notification" }) as Promise<{
    sent: boolean;
    state: any;
  }>;
}

export function resetSchedulerTimer(seconds?: number) {
  return chrome.runtime.sendMessage({ type: "reset-scheduler-timer", seconds }) as Promise<{
    success: boolean;
    state: any;
  }>;
}

export function updateSchedulerConfig(config: {
  devMode?: boolean;
  devIntervalSeconds?: number;
  customIntervalSeconds?: number;
  checkInsPaused?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  afterFocusReflection?: boolean;
  resetCooldown?: boolean;
}) {
  return chrome.runtime.sendMessage({ type: "update-scheduler-config", config }) as Promise<{
    success: boolean;
    state: any;
  }>;
}

export function submitCheckIn(payload: CheckInCreateInput) {
  return chrome.runtime.sendMessage({ type: "submit-checkin", payload }) as Promise<{
    success: boolean;
    queuedOffline: boolean;
    checkIn?: CheckIn;
    error?: string;
  }>;
}
