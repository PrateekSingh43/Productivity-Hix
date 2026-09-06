import { normalizeBrowserTabEvent, sanitizeUrl, type BrowserActivityEvent } from "@repo/telemetry";
import { recordEventCreated } from "../storage/settings";

type StoredTabState = {
  tabId: number | null;
  url: string | null;
  title: string | null;
  activeStartTime: number;
  windowFocused: boolean;
};

const TAB_STATE_KEY = "productivehix_tab_state";

export class TabTracker {
  private currentTabId: number | null = null;
  private currentUrl: string | null = null;
  private currentTitle: string | null = null;
  private activeStartTime: number = Date.now();
  private windowFocused: boolean = true;
  private installationId = "browser-ext-default";

  setInstallationId(id: string): void {
    this.installationId = id;
  }

  async loadPersistedState(): Promise<void> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const stored = await chrome.storage.local.get(TAB_STATE_KEY);
        const state = stored[TAB_STATE_KEY] as StoredTabState | undefined;
        if (state) {
          this.currentTabId = state.tabId;
          this.currentUrl = state.url;
          this.currentTitle = state.title;
          this.activeStartTime = state.activeStartTime || Date.now();
          this.windowFocused = state.windowFocused ?? true;
        }
      }
    } catch {
      // Storage lookup fallback
    }
  }

  private async savePersistedState(): Promise<void> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const state: StoredTabState = {
          tabId: this.currentTabId,
          url: this.currentUrl,
          title: this.currentTitle,
          activeStartTime: this.activeStartTime,
          windowFocused: this.windowFocused,
        };
        await chrome.storage.local.set({ [TAB_STATE_KEY]: state });
      }
    } catch {
      // Storage persist fallback
    }
  }

  private createEvent(url: string, title: string, startTime: number, endTime: number, tab?: chrome.tabs.Tab): BrowserActivityEvent | null {
    const durationMs = Math.max(0, endTime - startTime);
    if (durationMs < 1000) return null; // Ignore sub-second noise

    const event = normalizeBrowserTabEvent(this.installationId, {
      url,
      title,
      timestamp: new Date(startTime).toISOString(),
      durationMs,
      audible: tab?.audible,
      incognito: tab?.incognito,
    });

    // Development logging as specified in Requirement 7
    console.log(
      `[EXTENSION EVENT CREATED]\nsource: ${event.source}\neventId: ${event.eventId}\ninstallationId: ${event.installationId}\ndomain: ${event.data.domain}\ntitle: ${event.data.pageTitle}\ndurationMs: ${event.durationMs}\ntimestamp: ${event.timestamp}`
    );

    // Asynchronously record diagnostics
    void recordEventCreated({
      domain: event.data.domain,
      pageTitle: event.data.pageTitle,
      timestamp: event.timestamp,
      eventId: event.eventId,
      durationMs: event.durationMs,
    });

    return event;
  }

  async handleTabActivated(tab: chrome.tabs.Tab): Promise<BrowserActivityEvent | null> {
    await this.loadPersistedState();
    const now = Date.now();
    let previousEvent: BrowserActivityEvent | null = null;

    if (this.windowFocused && this.currentUrl && this.currentTitle) {
      previousEvent = this.createEvent(this.currentUrl, this.currentTitle, this.activeStartTime, now, tab);
    }

    this.currentTabId = tab.id ?? null;
    this.currentUrl = tab.url ?? null;
    this.currentTitle = tab.title ?? null;
    this.activeStartTime = now;
    this.windowFocused = true;

    await this.savePersistedState();
    return previousEvent;
  }

  async handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab,
  ): Promise<BrowserActivityEvent | null> {
    await this.loadPersistedState();
    if (tabId !== this.currentTabId) return null;

    if (changeInfo.url || changeInfo.title) {
      return this.handleTabActivated(tab);
    }

    return null;
  }

  async handleWindowFocusChanged(windowId: number): Promise<BrowserActivityEvent | null> {
    await this.loadPersistedState();
    const now = Date.now();

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // User switched focus away from browser window to desktop / another application
      if (this.windowFocused && this.currentUrl && this.currentTitle) {
        const event = this.createEvent(this.currentUrl, this.currentTitle, this.activeStartTime, now);
        this.windowFocused = false;
        await this.savePersistedState();
        return event;
      }
      this.windowFocused = false;
      await this.savePersistedState();
      return null;
    }

    // Window gained focus
    this.windowFocused = true;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId });
      if (activeTab?.url && !activeTab.url.startsWith("chrome://")) {
        this.currentTabId = activeTab.id ?? null;
        this.currentUrl = activeTab.url;
        this.currentTitle = activeTab.title ?? null;
        this.activeStartTime = now;
      }
    } catch {
      this.activeStartTime = now;
    }

    await this.savePersistedState();
    return null;
  }

  /**
   * Periodic continuous event emit for long active browsing sessions (>30s)
   */
  async handlePeriodicHeartbeat(): Promise<BrowserActivityEvent | null> {
    await this.loadPersistedState();
    if (!this.windowFocused || !this.currentUrl || !this.currentTitle) return null;

    const now = Date.now();
    const elapsed = now - this.activeStartTime;
    // Emit segment if on the same page for >= 30 seconds
    if (elapsed >= 30_000) {
      const event = this.createEvent(this.currentUrl, this.currentTitle, this.activeStartTime, now);
      this.activeStartTime = now;
      await this.savePersistedState();
      return event;
    }

    return null;
  }

  getCurrentActivity(): { domain: string; pageTitle: string; durationMs: number } | null {
    if (!this.currentUrl) return null;
    return {
      domain: sanitizeUrl(this.currentUrl).domain,
      pageTitle: this.currentTitle || "Untitled page",
      durationMs: Math.max(0, Date.now() - this.activeStartTime),
    };
  }
}
