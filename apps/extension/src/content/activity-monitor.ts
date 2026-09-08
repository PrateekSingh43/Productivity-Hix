/**
 * Lightweight browser interaction collector for ProductiveHix.
 * Captures user presence/activity without capturing keystrokes, form data, or PII.
 * Emits throttled "browser-activity-signal" to the background script.
 */

let lastEventTime = 0;
const THROTTLE_MS = 2000; // Throttle to maximum 1 signal per 2 seconds per tab

function signalActivity() {
  const now = Date.now();
  if (now - lastEventTime >= THROTTLE_MS) {
    lastEventTime = now;
    
    // Send a generic signal to the background script
    try {
      chrome.runtime.sendMessage({
        type: "browser-activity-signal",
        timestamp: now
      }).catch(() => {
        // Ignored: Background script might be suspended or disconnected
      });
    } catch (e) {
      // Ignored: Extension context invalidated (e.g. extension reloaded)
    }
  }
}

// Attach lightweight listeners. Use passive listeners for performance.
const options = { passive: true, capture: true };

window.addEventListener("mousemove", signalActivity, options);
window.addEventListener("mousedown", signalActivity, options);
window.addEventListener("keydown", signalActivity, options); // We DO NOT read the key, just the event itself
window.addEventListener("scroll", signalActivity, options);
window.addEventListener("wheel", signalActivity, options);
window.addEventListener("touchstart", signalActivity, options);

// Fire an initial signal on page load
signalActivity();

// --------------------------------------------------------------------------
// In-Page Reflection Modal (Loom / Grammarly Pattern)
// Injects a floating popup widget directly on the active tab without new tabs/windows
// --------------------------------------------------------------------------
let modalHost: HTMLElement | null = null;

function showReflectionModal(url: string) {
  // If modal is already attached and present, do not create duplicate
  if (modalHost && document.contains(modalHost)) {
    return;
  }

  const host = document.createElement("div");
  host.id = "productivehix-reflection-overlay";
  host.style.position = "fixed";
  host.style.top = "14px";
  host.style.right = "16px";
  host.style.width = "400px";
  host.style.height = "600px";
  host.style.maxHeight = "calc(100vh - 28px)";
  host.style.maxWidth = "calc(100vw - 32px)";
  host.style.zIndex = "2147483647";
  host.style.boxShadow = "0 20px 50px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(167, 139, 250, 0.3)";
  host.style.borderRadius = "14px";
  host.style.overflow = "hidden";
  host.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease";
  host.style.transform = "translateY(-12px) scale(0.97)";
  host.style.opacity = "0";
  host.style.background = "#0b0a10";

  const shadow = host.attachShadow({ mode: "open" });

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.style.display = "block";
  iframe.style.background = "#0b0a10";
  iframe.style.colorScheme = "dark";
  shadow.appendChild(iframe);

  const container = document.body || document.documentElement;
  container.appendChild(host);
  modalHost = host;

  // Smooth entrance
  requestAnimationFrame(() => {
    host.style.transform = "translateY(0) scale(1)";
    host.style.opacity = "1";
  });
}

function closeReflectionModal() {
  if (!modalHost || !modalHost.parentNode) {
    modalHost = null;
    return;
  }
  const host = modalHost;
  modalHost = null;
  host.style.transform = "translateY(-12px) scale(0.97)";
  host.style.opacity = "0";
  setTimeout(() => {
    host.remove();
  }, 220);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: any) => {
  if (message?.type === "SHOW_REFLECTION_MODAL" && message.url) {
    showReflectionModal(message.url);
  } else if (message?.type === "CLOSE_REFLECTION_MODAL") {
    closeReflectionModal();
  }
});

// Listen for postMessage from the iframe (e.g. Done & Close or X clicked)
window.addEventListener("message", (event) => {
  if (event.data?.type === "PRODUCTIVEHIX_CLOSE_MODAL") {
    closeReflectionModal();
  }
});

// Close modal on Escape
window.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && modalHost) {
      closeReflectionModal();
    }
  },
  { capture: true },
);
