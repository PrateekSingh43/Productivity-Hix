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
