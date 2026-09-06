# ProductiveHix Browser Extension

The extension is a Manifest V3 Chromium popup backed by a service worker. The worker owns tab/idle telemetry, strips URL query strings and fragments before queueing, and uploads bounded batches directly to the ProductiveHix API. The popup only reads server state and sends session/tracking commands through the worker.

## Build and load locally

From the repository root:

```powershell
pnpm --filter @repo/extension build
```

Load this exact unpacked directory in Chrome or Brave:

```text
C:\Users\prate\ProductiveHix\apps\extension\dist
```

Open `chrome://extensions` or `brave://extensions`, enable Developer mode, choose **Load unpacked**, select the `dist` directory, and pin **ProductiveHix Tracker**.

The popup can display activity without an API connection, but account metrics and upload require the API and an authenticated account context. The dashboard link is the supported account connection path; no credentials are collected by the extension.

## Privacy boundary

The extension does not read page contents, passwords, form values, or keystrokes. It records the active tab’s domain, sanitized URL path, title, and timing, plus browser idle transitions. Desktop status is queried through the optional Native Messaging host; desktop telemetry is uploaded directly by the desktop agent.
