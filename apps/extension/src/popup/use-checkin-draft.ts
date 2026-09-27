import { useCallback, useEffect, useRef, useState } from "react";

export interface CheckInDraftFields {
  assessment: string | null;
  alignment: string | null;
  selectedReasons: string[];
  state: string | null;
  energy: string | null;
  focus: string | null;
  note: string;
  deeperAnswers: Record<string, string>;
  step: number;
}

interface StoredDraft {
  contextKey: string;
  fields: Partial<CheckInDraftFields>;
  savedAt: string;
}

const STORAGE_KEY = "productivehix_checkin_draft";
const SAVE_DEBOUNCE_MS = 600;

/**
 * Autosaves in-progress reflection text to local extension storage.
 *
 * Why this exists: the reflection popup is fragile — if it closes mid-typing
 * (user clicks away, pastes into another app, browser sleeps), everything
 * typed was lost because it lived only in React state. With this hook the
 * half-written reflection is restored on reopen, keyed to the exact
 * reflection context (focus session id, or the hourly check-in at open
 * time) so stale text can never leak into the wrong reflection.
 *
 * Usage: pass the live fields object; when `draft` becomes non-null, apply
 * it once to local state, then call `clearDraft()` on submit/cancel.
 */
export function useCheckInDraft(contextKey: string, fields: CheckInDraftFields) {
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  const loadedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load once on mount; keep only drafts belonging to this context.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        const stored = data?.[STORAGE_KEY] as StoredDraft | undefined;
        if (!cancelled && stored && stored.contextKey === contextKey && stored.fields) {
          setDraft(stored);
        }
      } catch {
        // Storage unavailable (e.g. tests) — form simply starts empty.
      } finally {
        loadedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextKey]);

  // Debounced save on every field change. Skipped until the initial load
  // settles so a fresh mount never overwrites a stored draft with defaults.
  useEffect(() => {
    if (!loadedRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        void chrome.storage.local.set({
          [STORAGE_KEY]: { contextKey, fields, savedAt: new Date().toISOString() },
        });
      } catch {
        // Best-effort only; the form keeps working without persistence.
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [contextKey, fields]);

  const clearDraft = useCallback(() => {
    try {
      void chrome.storage.local.remove(STORAGE_KEY);
    } catch {}
    setDraft(null);
  }, []);

  return { draft, clearDraft };
}
