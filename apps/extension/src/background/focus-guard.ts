import type { WorkSession } from "@repo/types";
import { apiClient } from "../api/client";
import { getSettings } from "../storage/settings";
import {
  showFocusTargetNotification,
  showFocusStartedNotification,
  showFocusEndedNotification,
} from "./notifications";

const EXEMPT_HOSTS = [
  "accounts.google.com",
  "github.com/login",
  "login.microsoftonline.com",
  "auth0.com",
  "appleid.apple.com",
  "supabase.co",
  "localhost:5173",
  "localhost:5000",
  "localhost:3000",
  "localhost:4000",
  "127.0.0.1",
];

export class FocusGuardManager {
  private currentSession: WorkSession | null = null;
  private allowedTabIds = new Set<number>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectBackoffMs = 2000;
  private isConnecting = false;
  private isEnforcing = false;
  private targetTimer: ReturnType<typeof setTimeout> | null = null;
  private hasNotifiedTargetSessionId: string | null = null;

  getCurrentSession(): WorkSession | null {
    return this.currentSession;
  }

  async init(): Promise<void> {
    await this.refreshSession();
    this.connectWebSocket();
    this.setupTabListeners();
  }

  async refreshSession(): Promise<WorkSession | null> {
    try {
      const session = await apiClient.getActiveSession();
      this.setSession(session);
      return session;
    } catch {
      return null;
    }
  }

  setSession(session: WorkSession | null): void {
    this.currentSession = session;
    this.updateBadge();

    // Clear existing target timer / alarm
    if (this.targetTimer) {
      clearTimeout(this.targetTimer);
      this.targetTimer = null;
    }
    if (typeof chrome !== "undefined" && chrome.alarms?.clear) {
      void chrome.alarms.clear("focus-target-alarm");
    }

    if (!session || session.isPaused) {
      this.isEnforcing = false;
      if (!session) {
        this.hasNotifiedTargetSessionId = null;
      }
    } else {
      this.isEnforcing = true;
      this.checkTargetCompletion();

      // Schedule second-precision notification alarm if not yet completed
      const base = session.durationSeconds ?? 0;
      const currentSegment = Math.max(
        0,
        Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000),
      );
      const elapsedSec = base + currentSegment;
      const targetSec = (session.targetDurationMinutes ?? 25) * 60;
      const remainingSec = targetSec - elapsedSec;

      if (remainingSec > 0) {
        if (typeof chrome !== "undefined" && chrome.alarms?.create) {
          chrome.alarms.create("focus-target-alarm", {
            when: Date.now() + remainingSec * 1000,
          });
        }
        // Also set local timeout for immediate foreground trigger
        this.targetTimer = setTimeout(() => {
          this.checkTargetCompletion();
        }, remainingSec * 1000);
      }
    }

    // Broadcast to any active popups or views
    chrome.runtime.sendMessage({
      type: "session:updated",
      session,
    }).catch(() => {
      // Ignored if popup is closed
    });
  }

  checkTargetCompletion(): void {
    if (!this.currentSession || this.currentSession.isPaused) return;
    if (this.hasNotifiedTargetSessionId === this.currentSession.id) return;

    const base = this.currentSession.durationSeconds ?? 0;
    const currentSegment = Math.max(
      0,
      Math.floor((Date.now() - new Date(this.currentSession.startedAt).getTime()) / 1000),
    );
    const elapsedSec = base + currentSegment;
    const targetSec = (this.currentSession.targetDurationMinutes ?? 25) * 60;

    if (elapsedSec >= targetSec) {
      this.hasNotifiedTargetSessionId = this.currentSession.id;
      const targetMins = this.currentSession.targetDurationMinutes ?? 25;
      const taskTitle = this.currentSession.taskTitle || this.currentSession.notes || "Focus Block";

      void showFocusTargetNotification({
        sessionId: this.currentSession.id,
        taskTitle,
        targetMinutes: targetMins,
      });
    }
  }

  private updateBadge(): void {
    if (!this.currentSession) {
      void chrome.action.setBadgeText({ text: "" });
      return;
    }

    if (this.currentSession.isPaused) {
      void chrome.action.setBadgeText({ text: "||" });
      void chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" }); // amber
    } else {
      void chrome.action.setBadgeText({ text: "ON" });
      void chrome.action.setBadgeBackgroundColor({ color: "#27272a" }); // neutral monochrome
    }
  }

  private async connectWebSocket(): Promise<void> {
    if (this.isConnecting) return;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.isConnecting = true;
    try {
      // Check if backend API is reachable first before attempting WebSocket to prevent noisy net::ERR_CONNECTION_REFUSED
      const isReachable = await apiClient.isReachable();
      if (!isReachable) {
        this.scheduleReconnect();
        return;
      }

      const settings = await getSettings();
      const apiUrl = settings.apiUrl || "http://localhost:5000";
      const wsUrl = apiUrl.replace(/^http/, "ws");
      const token = settings.deviceToken || "";
      const userId = settings.userId || "00000000-0000-0000-0000-000000000001";
      const endpoint = `${wsUrl.replace(/\/$/, "")}/ws?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;

      const ws = new WebSocket(endpoint);
      this.socket = ws;

      ws.onopen = () => {
        console.log("[FOCUS GUARD] Real-time WebSocket connected");
        this.reconnectBackoffMs = 2000; // Reset backoff on successful connection
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "session:started" || data.type === "session:resumed") {
            const isNewStart = !this.currentSession || this.currentSession.id !== data.session?.id;
            this.setSession(data.session);
            if (isNewStart && data.session && !data.session.isPaused) {
              const taskTitle = data.session.taskTitle || data.session.notes || "Deliberate Focus";
              const targetMins = data.session.targetDurationMinutes ?? 25;
              void showFocusStartedNotification({
                taskTitle,
                targetMinutes: targetMins,
              });
            }
          } else if (data.type === "session:paused") {
            this.setSession(data.session);
          } else if (data.type === "session:ended") {
            const prevSession = this.currentSession;
            this.setSession(null);
            this.allowedTabIds.clear();
            if (prevSession && !data.discarded) {
              const taskTitle = prevSession.taskTitle || prevSession.notes || "Focus Block";
              const elapsedSec = prevSession.durationSeconds ?? 0;
              const durationMinutes = Math.max(1, Math.round(elapsedSec / 60));
              void showFocusEndedNotification({
                taskTitle,
                durationMinutes,
              });
            }
          } else if (data.type === "preferences:updated" && data.preferences) {
            try {
              const { reflectionEngine } = await import("./reflection-engine");
              const { inactivityEngine } = await import("./inactivity-engine");
              await reflectionEngine.updateConfig({
                quietHoursEnabled: data.preferences.quietHoursEnabled,
                quietHoursStart: data.preferences.quietHoursStart,
                quietHoursEnd: data.preferences.quietHoursEnd,
                suppressCheckInsDuringFocus: data.preferences.suppressCheckInsDuringFocus,
              });
              await inactivityEngine.reloadConfig();
            } catch (err) {
              console.warn("[FOCUS GUARD] Failed to forward updated preferences:", err);
            }
          }
        } catch (e) {
          console.warn("[FOCUS GUARD] Failed to parse WebSocket message:", e);
        }
      };

      ws.onclose = () => {
        this.socket = null;
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
        this.socket = null;
      };
    } catch (err) {
      console.warn("[FOCUS GUARD] Failed to connect WebSocket:", err);
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnectBackoffMs;
    // Exponential backoff capped at 30 seconds
    this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 1.5, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectWebSocket();
    }, delay);
  }

  private isExemptUrl(urlStr?: string): boolean {
    if (!urlStr) return true;
    if (
      urlStr.startsWith("chrome://") ||
      urlStr.startsWith("chrome-extension://") ||
      urlStr.startsWith("devtools://") ||
      urlStr.startsWith("edge://") ||
      urlStr.startsWith("about:") ||
      urlStr.startsWith("view-source:")
    ) {
      return true;
    }

    try {
      const url = new URL(urlStr);
      return EXEMPT_HOSTS.some((exempt) => url.hostname === exempt || url.hostname.endsWith(`.${exempt}`));
    } catch {
      return false;
    }
  }

  private setupTabListeners(): void {
    chrome.tabs.onCreated.addListener((tab) => {
      void this.checkTabLimit(tab);
    });

    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.url) {
        void this.checkTabLimit(tab);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.allowedTabIds.delete(tabId);
    });
  }

  private async checkTabLimit(tab: chrome.tabs.Tab): Promise<void> {
    if (!this.isEnforcing || !this.currentSession || this.currentSession.isPaused) {
      return;
    }

    if (!tab.id || !tab.windowId) return;
    if (this.allowedTabIds.has(tab.id)) return;

    const url = tab.url || tab.pendingUrl;
    if (this.isExemptUrl(url)) return;

    try {
      const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
      // Filter out internal non-page tabs if any
      const normalTabs = windowTabs.filter(
        (t) => !t.url?.startsWith("chrome-extension://") || !t.url?.includes("focus-guard.html"),
      );

      // Enforce 3 tab limit
      if (normalTabs.length > 3) {
        const guardPage = chrome.runtime.getURL(
          `focus-guard.html?tabId=${tab.id}&targetUrl=${encodeURIComponent(url || "")}&taskTitle=${encodeURIComponent(
            this.currentSession.taskTitle || this.currentSession.notes || "Active Focus",
          )}`,
        );

        await chrome.tabs.update(tab.id, { url: guardPage });
      }
    } catch (err) {
      console.warn("[FOCUS GUARD] Error checking tab limit:", err);
    }
  }

  async handleSwap(tabId: number, targetUrl: string): Promise<boolean> {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.windowId) return false;

      const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
      const candidates = windowTabs.filter(
        (t) =>
          t.id !== tabId &&
          !t.pinned &&
          t.id !== undefined &&
          !t.url?.startsWith("chrome-extension://"),
      );

      if (candidates.length > 0) {
        // Sort by last accessed timestamp ascending (oldest accessed tab first)
        candidates.sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0));
        const oldest = candidates[0];
        if (oldest?.id) {
          await chrome.tabs.remove(oldest.id);
        }
      }

      this.allowedTabIds.add(tabId);
      await chrome.tabs.update(tabId, { url: targetUrl });
      return true;
    } catch (err) {
      console.error("[FOCUS GUARD] Swap failed:", err);
      return false;
    }
  }

  async handleCloseTab(tabId: number): Promise<boolean> {
    try {
      await chrome.tabs.remove(tabId);
      return true;
    } catch {
      return false;
    }
  }

  async handleAllowTab(tabId: number, targetUrl: string): Promise<boolean> {
    try {
      this.allowedTabIds.add(tabId);
      await chrome.tabs.update(tabId, { url: targetUrl });
      return true;
    } catch {
      return false;
    }
  }
}

export const focusGuard = new FocusGuardManager();
