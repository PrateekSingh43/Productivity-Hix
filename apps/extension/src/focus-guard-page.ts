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
