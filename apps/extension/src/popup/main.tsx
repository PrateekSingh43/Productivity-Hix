import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";

// Immediately initialize theme without violating CSP
if (typeof chrome !== "undefined" && chrome.storage?.local) {
  chrome.storage.local.get(["theme"], (res) => {
    if (res?.theme) {
      document.documentElement.setAttribute("data-theme", res.theme);
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 0, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
