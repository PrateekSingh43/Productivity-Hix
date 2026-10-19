import type { WorkSession } from "@repo/types";
import { apiClient } from "../api/client";
import { getSettings, updateSettings } from "../storage/settings";
import {
  showFocusTargetNotification,
  showFocusStartedNotification,
  showFocusEndedNotification,
  showFocusGuardTabNotification,
  showFocusGuardStartupNudge,
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

export const FOCUS_SESSION_STORAGE_KEY = "productivehix_active_focus_session";
export const FOCUS_GUARD_ALLOWED_TABS_KEY = "productivehix_focus_guard_allowed_tabs";

/**
 * How long a locally-initiated session end suppresses the matching server
 * broadcast echo (`session:ended`). The popup announces its end intent before
 * the finish API call resolves, while the broadcast can arrive seconds later
 * (or after a WebSocket reconnect), so the window must comfortably cover that.
 */
export const LOCAL_END_SUPPRESSION_WINDOW_MS = 120_000;

export class FocusGuardManager {
  private enabled = true;
  private limit = 3;
  private currentSession: WorkSession | null = null;
  private allowedTabIds = new Set<number>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectBackoffMs = 2000;
  private isConnecting = false;
  private isEnforcing = false;
  private targetTimer: ReturnType<typeof setTimeout> | null = null;
  private hasNotifiedTargetSessionId: string | null = null;
  private hasNotifiedStartupNudgeSessionId: string | null = null;
  private hasInitializedState = false;
  /**
   * The session id whose end was initiated by THIS extension client, plus the
   * time the intent was announced. Its server broadcast echo must not produce
   * a focus-ended notification: the popup already navigated to the Reflect
   * tab (or deliberately fired its own single notification). Single slot is
   * sufficient because only one focus session can be active at a time.
   */
  private suppressedEndedSessionId: string | null = null;
  private suppressedEndedAtMs = 0;

  /**
   * Records that this client is ending `sessionId` right now. Must be called
   * BEFORE the finish API call so the suppression is in place no matter
   * whether the server broadcast arrives before or after the local ack.
   */
  suppressEndedNotificationFor(sessionId: string | null | undefined): void {
    if (!sessionId) return;
    this.suppressedEndedSessionId = sessionId;
    this.suppressedEndedAtMs = Date.now();
  }

  isEndedNotificationSuppressed(sessionId: string | null | undefined): boolean {
    if (!sessionId || sessionId !== this.suppressedEndedSessionId) return false;
    if (Date.now() - this.suppressedEndedAtMs > LOCAL_END_SUPPRESSION_WINDOW_MS) {
      this.suppressedEndedSessionId = null;
      this.suppressedEndedAtMs = 0;
      return false;
    }
    return true;
  }

  /**
   * Handles a server-broadcast session end. Always clears local focus state;
   * dispatches the focus-ended notification only for genuinely remote ends
   * (web/other device/natural completion), never for the echo of a session
   * this client ended itself and already reflected on.
   *
   * @returns true when a focus-ended notification was dispatched.
   */
  handleRemoteSessionEnded(payload: {
    session?: { id?: string } | null;
    sessionId?: string;
    discarded?: boolean;
  }): boolean {
    const prevSession = this.currentSession;
    this.setSession(null);
    this.allowedTabIds.clear();
    if (prevSession && !payload.discarded) {
      const endedId = payload.session?.id ?? payload.sessionId ?? prevSession.id;
      if (this.isEndedNotificationSuppressed(endedId)) {
        this.suppressedEndedSessionId = null;
        this.suppressedEndedAtMs = 0;
        return false;
      }
      const taskTitle = prevSession.taskTitle || prevSession.notes || "Focus Block";
      const elapsedSec = prevSession.durationSeconds ?? 0;
      const durationMinutes = Math.max(1, Math.round(elapsedSec / 60));
      void showFocusEndedNotification({
        taskTitle,
        durationMinutes,
      });
      return true;
    }
    return false;
  }

  hasAuthoritativeState(): boolean {
    return this.hasInitializedState;
  }

  getCurrentSession(): WorkSession | null {
    return this.currentSession;
  }

  isSessionActive(): boolean {
    return Boolean(this.currentSession && !this.currentSession.endedAt);
  }

  isFocusBlockActive(): boolean {
    return Boolean(this.currentSession && !this.currentSession.endedAt);
  }

  getConfig(): { enabled: boolean; limit: number } {
    return { enabled: this.enabled, limit: this.limit };
  }

  async updateConfig(config: { enabled?: boolean; limit?: number }): Promise<{ enabled: boolean; limit: number }> {
    if (typeof config.enabled === "boolean") {
      this.enabled = config.enabled;
    }
    if (typeof config.limit === "number" && config.limit >= 1) {
      this.limit = config.limit;
    }
    await updateSettings({
      focusGuardEnabled: this.enabled,
      focusGuardLimit: this.limit,
    });

    if (this.currentSession && !this.currentSession.isPaused) {
      this.isEnforcing = this.enabled;
      if (this.enabled) {
        void this.auditExistingTabs();
      }
    }
    return { enabled: this.enabled, limit: this.limit };
  }

  private persistAllowedTabs(): void {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        void chrome.storage.local.set({ [FOCUS_GUARD_ALLOWED_TABS_KEY]: Array.from(this.allowedTabIds) });
      }
    } catch {}
  }

  private async restoreAllowedTabs(): Promise<void> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const stored = await chrome.storage.local.get(FOCUS_GUARD_ALLOWED_TABS_KEY);
        const saved = stored[FOCUS_GUARD_ALLOWED_TABS_KEY] as number[] | null;
        if (Array.isArray(saved)) {
          this.allowedTabIds = new Set(saved.filter((id) => typeof id === "number"));
        }
      }
    } catch {}
  }

  async init(): Promise<void> {
    try {
      const settings = await getSettings();
      this.enabled = settings.focusGuardEnabled ?? true;
      this.limit = settings.focusGuardLimit ?? 3;
    } catch (err) {
      console.warn("[FOCUS GUARD] Failed to load settings during init:", err);
    }

    // Immediately restore cached focus session from storage for instantaneous zero-latency awareness
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const stored = await chrome.storage.local.get(FOCUS_SESSION_STORAGE_KEY);
        const saved = stored[FOCUS_SESSION_STORAGE_KEY] as WorkSession | null;
        if (saved && !saved.endedAt) {
          this.currentSession = saved;
          this.isEnforcing = this.enabled && !saved.isPaused;
          this.updateBadge();
        }
      }
    } catch {}

    // Restore the working set so an MV3 service-worker restart does not
    // reshuffle which tabs are allowed (previously allowedTabIds was
    // memory-only, so the first reload after a restart blocked at random).
    await this.restoreAllowedTabs();

    await this.refreshSession();
    this.connectWebSocket();
    this.setupTabListeners();
    this.hasInitializedState = true;

    // If a session is active but the working set is empty (fresh profile,
    // storage cleared, or first run after update), audit now so the limit is
    // enforced deterministically instead of on the next random tab event.
    if (this.currentSession && !this.currentSession.isPaused && this.allowedTabIds.size === 0) {
      void this.auditExistingTabs();
    }
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
    const isNewActiveSession =
      Boolean(session && !session.isPaused) &&
      (!this.currentSession || this.currentSession.id !== session?.id || this.currentSession.isPaused);

    this.currentSession = session;
    this.hasInitializedState = true;
    this.updateBadge();

    // Persist active session synchronously to storage so background service worker restarts know immediately
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      if (session && !session.endedAt) {
        void chrome.storage.local.set({ [FOCUS_SESSION_STORAGE_KEY]: session });
      } else {
        void chrome.storage.local.remove(FOCUS_SESSION_STORAGE_KEY);
      }
    }

    // Immediately reset reflection engine active work accumulator when focus mode is active
    if (session && !session.endedAt) {
      import("./reflection-engine").then(({ reflectionEngine }) => {
        void reflectionEngine.forceReset();
      }).catch(() => {});
    }

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
      import("./reflection-engine").then(({ reflectionEngine }) => {
        reflectionEngine.clearFocusCache();
      }).catch(() => {});
      import("./inactivity-engine").then(({ inactivityEngine }) => {
        inactivityEngine.clearFocusCache();
      }).catch(() => {});
      if (!session) {
        this.hasNotifiedTargetSessionId = null;
        this.hasNotifiedStartupNudgeSessionId = null;
        this.allowedTabIds.clear();
        this.persistAllowedTabs();
        // Release tabs already parked on the guard page: without this they
        // stay stuck on focus-guard.html after the session ends, since
        // checkTabLimit() only gates *new* navigations.
        void this.releaseGuardedTabs();
      }
    } else {
      this.isEnforcing = this.enabled;
      this.checkTargetCompletion();

      // Audit existing tabs when starting/resuming focus mode
      if (isNewActiveSession) {
        void this.auditExistingTabs();
      }

      // Schedule the target-reached alarm only for sessions that explicitly
      // declared a target. Open-ended sessions have none — never invent 25m.
      if (session.targetDurationMinutes != null) {
        const base = session.durationSeconds ?? 0;
        const startMs = Date.parse(session.lastResumedAt ?? session.startedAt);
        const currentSegment = Number.isFinite(startMs)
          ? Math.max(0, Math.floor((Date.now() - startMs) / 1000))
          : 0;
        const elapsedSec = base + currentSegment;
        const remainingSec = session.targetDurationMinutes * 60 - elapsedSec;

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
          if (typeof (this.targetTimer as any)?.unref === "function") {
            (this.targetTimer as any).unref();
          }
        }
      }
    }

    // Broadcast to any active popups or views
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: "session:updated",
        session,
      }).catch(() => {
        // Ignored if popup is closed
      });
    }
  }

  /**
   * Restores every tab currently parked on `focus-guard.html` to its original
   * destination. Called when the focus session ends so stale guard pages do
   * not remain blocked. New tabs opened after the session are already allowed
   * (isEnforcing === false); this handles tabs intercepted *during* the
   * session whose content is still the guard page.
   */
  async releaseGuardedTabs(): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.tabs?.update) return;
    try {
      const allTabs = await chrome.tabs.query({});
      for (const t of allTabs) {
        const url = (t as { url?: string; pendingUrl?: string }).url ||
          (t as { pendingUrl?: string }).pendingUrl ||
          "";
        if (!url.includes("focus-guard.html")) continue;
        if ((t as { id?: number }).id === undefined) continue;
        const tabId = (t as { id: number }).id;
        let targetUrl = "";
        try {
          const guardUrl = new URL(url);
          targetUrl = guardUrl.searchParams.get("targetUrl") || "";
        } catch {
          targetUrl = "";
        }
        try {
          if (targetUrl && targetUrl !== "about:blank" && !targetUrl.startsWith("chrome://newtab")) {
            await chrome.tabs.update(tabId, { url: targetUrl });
          } else {
            try {
              await chrome.tabs.update(tabId, { url: "chrome://newtab/" });
            } catch {
              await chrome.tabs.update(tabId, { url: "about:blank" });
            }
          }
        } catch (err) {
          console.warn("[FOCUS GUARD] Failed to release guarded tab:", tabId, err);
        }
      }
    } catch (err) {
      console.warn("[FOCUS GUARD] Failed to query guarded tabs:", err);
    }
  }

  /**
   * Enforces the tab limit immediately when a session starts/resumes, so
   * pre-existing tabs beyond the limit show the guard page at once instead
   * of only after a manual reload. Previously this only seeded the first N
   * tabs and left excess tabs fully usable, which read as "blocker doesn't
   * work until reload".
   *
   * Keep set is deterministic: the active tab is always kept, then the most
   * recently accessed tabs fill up to `limit`. Pinned tabs and exempt URLs
   * (auth, devtools, settings) are never parked. Parked tabs keep their
   * original URL in `targetUrl` and are restored by `releaseGuardedTabs()`
   * when the session ends.
   */
  async auditExistingTabs(): Promise<void> {
    if (!this.enabled || !this.isEnforcing || !this.currentSession || this.currentSession.isPaused) {
      return;
    }
    if (typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.tabs?.update) return;

    try {
      const windowTabs = await chrome.tabs.query({ currentWindow: true });
      const normalTabs = windowTabs.filter((t) => {
        const u = (t as { url?: string; pendingUrl?: string }).url ||
          (t as { pendingUrl?: string }).pendingUrl ||
          "";
        if (u.startsWith("devtools://")) return false;
        if (u.startsWith("chrome-extension://") && !u.includes("focus-guard.html")) return false;
        return true;
      });

      if (!this.currentSession || this.currentSession.isPaused) return;
      // Capture identity up front: the session may end while this async audit
      // is in flight (setSession(null) re-enters), and touching
      // this.currentSession.id afterwards would throw on null.
      const auditSessionId = this.currentSession.id;

      // Deterministic working set: active tab first, then most-recently-used.
      const sorted = [...normalTabs].sort((a, b) => {
        const aActive = Boolean((a as { active?: boolean }).active);
        const bActive = Boolean((b as { active?: boolean }).active);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return ((b as { lastAccessed?: number }).lastAccessed ?? 0) - ((a as { lastAccessed?: number }).lastAccessed ?? 0);
      });

      const keep = new Set<number>();
      for (const t of sorted) {
        if (keep.size >= this.limit) break;
        const url = (t as { url?: string; pendingUrl?: string }).url ||
          (t as { pendingUrl?: string }).pendingUrl ||
          "";
        if (url.includes("focus-guard.html")) continue;
        if (this.isExemptTarget(url)) continue;
        if ((t as { pinned?: boolean }).pinned) continue;
        if (t.id !== undefined) keep.add(t.id);
      }

      this.allowedTabIds = keep;
      this.persistAllowedTabs();

      const taskTitle = this.currentSession.taskTitle || this.currentSession.notes || "Active Focus";

      // Park every excess tab immediately so no reload is needed.
      for (const t of normalTabs) {
        if (t.id === undefined || keep.has(t.id)) continue;
        try {
          // Re-read fresh state: a concurrent checkTabLimit may have parked
          // this tab already (stale event objects would nest guard URLs).
          const fresh = await chrome.tabs.get(t.id).catch(() => null);
          const freshUrl = (fresh as { url?: string; pendingUrl?: string } | null)?.url ||
            (fresh as { pendingUrl?: string } | null)?.pendingUrl ||
            "";
          if (!freshUrl || freshUrl.includes("focus-guard.html")) continue;
          if (this.isExemptTarget(freshUrl)) continue;
          if ((fresh as { pinned?: boolean } | null)?.pinned) continue;
          const guardPage = chrome.runtime.getURL(
            `focus-guard.html?tabId=${t.id}&targetUrl=${encodeURIComponent(freshUrl)}&taskTitle=${encodeURIComponent(
              taskTitle,
            )}&limit=${this.limit}`,
          );
          await chrome.tabs.update(t.id, { url: guardPage });
        } catch (err) {
          console.warn("[FOCUS GUARD] Failed to park excess tab:", t.id, err);
        }
      }

      // Only notify if the same session is still active; it may have ended
      // while the parking loop above was awaiting tab updates.
      if (normalTabs.length > this.limit && this.currentSession?.id === auditSessionId) {
        if (this.hasNotifiedStartupNudgeSessionId !== auditSessionId) {
          this.hasNotifiedStartupNudgeSessionId = auditSessionId;
          void showFocusGuardStartupNudge({
            taskTitle,
            limit: this.limit,
            openCount: normalTabs.length,
          });
        }
      }
    } catch (err) {
      console.warn("[FOCUS GUARD] Error during auditExistingTabs:", err);
    }
  }

  checkTargetCompletion(): void {
    if (!this.currentSession || this.currentSession.isPaused) return;
    // Open-ended sessions (no explicit target) have nothing to complete.
    if (this.currentSession.targetDurationMinutes == null) return;
    if (this.hasNotifiedTargetSessionId === this.currentSession.id) return;

    const base = this.currentSession.durationSeconds ?? 0;
    const startMs = Date.parse(this.currentSession.lastResumedAt ?? this.currentSession.startedAt);
    const currentSegment = Number.isFinite(startMs)
      ? Math.max(0, Math.floor((Date.now() - startMs) / 1000))
      : 0;
    const elapsedSec = base + currentSegment;
    const targetSec = this.currentSession.targetDurationMinutes * 60;

    if (elapsedSec >= targetSec) {
      this.hasNotifiedTargetSessionId = this.currentSession.id;
      const targetMins = this.currentSession.targetDurationMinutes;
      const taskTitle = this.currentSession.taskTitle || this.currentSession.notes || "Focus Block";

      void showFocusTargetNotification({
        sessionId: this.currentSession.id,
        taskTitle,
        targetMinutes: targetMins,
      });
    }
  }

  private updateBadge(): void {
    if (typeof chrome === "undefined" || !chrome.action?.setBadgeText) return;

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
        this.reconnectBackoffMs = 2000;
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "session:started" || data.type === "session:resumed") {
            const isNewStart = !this.currentSession || this.currentSession.id !== data.session?.id;
            this.setSession(data.session);
            if (isNewStart && data.session && !data.session.isPaused) {
              const taskTitle = data.session.taskTitle || data.session.notes || "Deliberate Focus";
              void showFocusStartedNotification({
                taskTitle,
                targetMinutes: data.session.targetDurationMinutes ?? undefined,
              });
            }
          } else if (data.type === "session:paused") {
            this.setSession(data.session);
          } else if (data.type === "session:ended") {
            this.handleRemoteSessionEnded(data);
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
    this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 1.5, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectWebSocket();
    }, delay);
    if (typeof (this.reconnectTimer as any)?.unref === "function") {
      (this.reconnectTimer as any).unref();
    }
  }

  private isExemptTarget(urlStr?: string): boolean {
    if (!urlStr) return false;
    if (
      urlStr.startsWith("chrome-extension://") ||
      urlStr.startsWith("devtools://") ||
      urlStr.startsWith("chrome://settings") ||
      urlStr.startsWith("chrome://extensions") ||
      urlStr.startsWith("edge://settings") ||
      urlStr.startsWith("edge://extensions")
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
    if (typeof chrome === "undefined" || !chrome.tabs) return;

    chrome.tabs.onCreated.addListener((tab) => {
      void this.checkTabLimit(tab);
    });

    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.url || changeInfo.status === "loading") {
        void this.checkTabLimit(tab);
      }
    });

    // NOTE: onActivated (switching between open tabs) intentionally DOES NOT intercept.
    // Users must be able to switch freely between their working tabs without being blocked!

    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.allowedTabIds.delete(tabId)) this.persistAllowedTabs();
    });
  }

  private async checkTabLimit(tab: chrome.tabs.Tab): Promise<void> {
    if (!this.enabled || !this.isEnforcing || !this.currentSession || this.currentSession.isPaused) {
      return;
    }

    if (!tab.id || tab.windowId === undefined) return;
    if (this.allowedTabIds.has(tab.id)) return;

    const url = tab.url || tab.pendingUrl || "";
    if (url.includes("focus-guard.html")) return;
    if (this.isExemptTarget(url)) return;

    try {
      const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
      // Re-read fresh state: the event's tab object may be stale (e.g. a
      // concurrent audit parked this tab already, or a reload event carries
      // the pre-reload URL). Never nest guard pages and never park twice.
      const fresh = windowTabs.find((t) => t.id === tab.id);
      const freshUrl = fresh ? (fresh.url || fresh.pendingUrl || "") : url;
      if (freshUrl.includes("focus-guard.html")) return;
      if (this.isExemptTarget(freshUrl)) return;
      const normalTabs = windowTabs.filter((t) => {
        const u = t.url || t.pendingUrl || "";
        if (u.startsWith("devtools://")) return false;
        if (u.startsWith("chrome-extension://") && !u.includes("focus-guard.html")) return false;
        return true;
      });

      // If the total number of normal tabs in the window is within the limit, allow it automatically!
      if (normalTabs.length <= this.limit) {
        this.allowedTabIds.add(tab.id);
        this.persistAllowedTabs();
        return;
      }

      // Excess tab beyond limit: intercept this specific new tab
      const taskTitle = this.currentSession.taskTitle || this.currentSession.notes || "Active Focus";
      const guardPage = chrome.runtime.getURL(
        `focus-guard.html?tabId=${tab.id}&targetUrl=${encodeURIComponent(freshUrl)}&taskTitle=${encodeURIComponent(
          taskTitle,
        )}&limit=${this.limit}`,
      );

      await chrome.tabs.update(tab.id, { url: guardPage });

      void showFocusGuardTabNotification({
        taskTitle,
        limit: this.limit,
      });
    } catch (err) {
      console.warn("[FOCUS GUARD] Error checking tab limit:", err);
    }
  }

  async handleSwap(tabId: number, targetUrl: string): Promise<boolean> {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || tab.windowId === undefined) return false;

      const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
      const candidates = windowTabs.filter(
        (t) =>
          t.id !== tabId &&
          !t.pinned &&
          t.id !== undefined &&
          !t.url?.startsWith("chrome-extension://"),
      );

      if (candidates.length > 0) {
        candidates.sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0));
        const oldest = candidates[0];
        if (oldest?.id) {
          await chrome.tabs.remove(oldest.id);
        }
      }

      this.allowedTabIds.add(tabId);
      this.persistAllowedTabs();
      if (targetUrl && !targetUrl.startsWith("chrome://newtab") && targetUrl !== "about:blank") {
        await chrome.tabs.update(tabId, { url: targetUrl });
      } else {
        try {
          await chrome.tabs.update(tabId, { url: "chrome://newtab/" });
        } catch {
          await chrome.tabs.update(tabId, { url: "about:blank" });
        }
      }
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
      this.persistAllowedTabs();
      if (targetUrl && !targetUrl.startsWith("chrome://newtab") && targetUrl !== "about:blank") {
        await chrome.tabs.update(tabId, { url: targetUrl });
      } else {
        try {
          await chrome.tabs.update(tabId, { url: "chrome://newtab/" });
        } catch {
          await chrome.tabs.update(tabId, { url: "about:blank" });
        }
      }
      return true;
    } catch (err) {
      console.error("[FOCUS GUARD] Allow tab failed:", err);
      return false;
    }
  }
}

export const focusGuard = new FocusGuardManager();
