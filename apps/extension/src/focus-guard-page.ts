const params = new URLSearchParams(window.location.search);
const tabId = parseInt(params.get("tabId") || "0", 10);
const targetUrl = params.get("targetUrl") || "";
const taskTitle = params.get("taskTitle") || "Active Focus Block";
const limit = parseInt(params.get("limit") || "3", 10);

const headingEl = document.getElementById("guard-heading");
if (headingEl) headingEl.textContent = `${limit} Tab Limit Reached`;

const descEl = document.getElementById("guard-desc");
if (descEl) {
  descEl.textContent = `You are in an intentional focus block. To maintain high cognitive momentum and eliminate tab sprawl, your browser is limited to ${limit} active tabs.`;
}

const titleEl = document.getElementById("session-title");
if (titleEl) titleEl.textContent = taskTitle;

const destEl = document.getElementById("dest-url");
const isBlankOrNewTab = !targetUrl || targetUrl === "about:blank" || targetUrl.startsWith("chrome://newtab");
if (destEl) {
  destEl.textContent = isBlankOrNewTab ? "New Tab" : targetUrl;
}

/**
 * Self-healing: a tab parked on this guard page must not stay blocked after
 * the focus session ends. The background proactively restores guarded tabs
 * (see FocusGuardManager.releaseGuardedTabs), but as a second layer this page
 * checks session liveness on load and listens for session end broadcasts.
 */
function releaseToDestination(): void {
  if (targetUrl && targetUrl !== "about:blank" && !targetUrl.startsWith("chrome://newtab")) {
    window.location.href = targetUrl;
  } else {
    // No meaningful destination: fall back to a fresh tab page.
    try {
      window.location.href = "chrome://newtab/";
    } catch {
      window.location.href = "about:blank";
    }
  }
}

function isSessionLive(session: { endedAt?: string | null } | null | undefined): boolean {
  return Boolean(session && !(session as { endedAt?: string | null }).endedAt);
}

try {
  // On load: if no live session, immediately release instead of showing stale block.
  chrome.runtime
    .sendMessage({ type: "get-active-session" })
    .then((session) => {
      if (!isSessionLive(session as { endedAt?: string | null } | null)) {
        releaseToDestination();
      }
    })
    .catch(() => {
      // Background unreachable (e.g. reloaded): do not trap the user.
    });

  // Live update: release the moment the session ends elsewhere.
  chrome.runtime.onMessage.addListener((message: { type?: string; session?: { endedAt?: string | null } | null }) => {
    if (message?.type === "session:updated" && !isSessionLive(message.session)) {
      releaseToDestination();
    }
  });
} catch {
  // Non-extension context (dev preview): no-op.
}

document.getElementById("btn-swap")?.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    {
      type: "focus-guard-swap",
      tabId,
      targetUrl,
    },
    (res) => {
      if (!res?.success && targetUrl && !targetUrl.startsWith("chrome://")) {
        window.location.href = targetUrl;
      }
    },
  );
});

document.getElementById("btn-close")?.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    {
      type: "focus-guard-close-tab",
      tabId,
    },
    () => {
      window.close();
    },
  );
});

document.getElementById("btn-allow")?.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    {
      type: "focus-guard-allow-tab",
      tabId,
      targetUrl,
    },
    (res) => {
      if (!res?.success && targetUrl && !targetUrl.startsWith("chrome://")) {
        window.location.href = targetUrl;
      }
    },
  );
});
