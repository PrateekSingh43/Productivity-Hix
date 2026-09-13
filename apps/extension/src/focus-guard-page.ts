const params = new URLSearchParams(window.location.search);
const tabId = parseInt(params.get("tabId") || "0", 10);
const targetUrl = params.get("targetUrl") || "";
const taskTitle = params.get("taskTitle") || "Active Focus Block";

const titleEl = document.getElementById("session-title");
if (titleEl) titleEl.textContent = taskTitle;

const destEl = document.getElementById("dest-url");
if (destEl) destEl.textContent = targetUrl || "about:blank";

document.getElementById("btn-swap")?.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    {
      type: "focus-guard-swap",
      tabId,
      targetUrl,
    },
    (res) => {
      if (!res?.success && targetUrl) {
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
    () => {
      if (targetUrl) {
        window.location.href = targetUrl;
      }
    },
  );
});
