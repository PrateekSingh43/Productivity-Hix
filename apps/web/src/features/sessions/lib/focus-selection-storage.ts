/**
 * Temporary UI convenience for the pre-start focus selection.
 *
 * `sessionStorage` only survives a component remount within the same tab
 * (e.g. navigating away from Sessions and back). It is NOT an authoritative
 * source of work-context: the server's active-session record always wins,
 * and the stored value is only ever a task id, validated against the task
 * list actually available to the user before being restored. When a session
 * starts, or the user changes/clears the selection, the stored value is
 * updated or removed.
 */
const STORAGE_KEY = "phix.sessions.selected-focus-task-id";

function getStorage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/** Stored task id, or null when absent/unreadable. Never throws. */
export function readStoredFocusTaskId(): string | null {
  try {
    const value = getStorage()?.getItem(STORAGE_KEY) ?? null;
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Store a task id, or clear the stored selection when null. Never throws. */
export function writeStoredFocusTaskId(taskId: string | null): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (taskId) storage.setItem(STORAGE_KEY, taskId);
    else storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage being unavailable must never break session start/selection.
  }
}

/**
 * Returns the stored id only when it still maps to an available task.
 * A stale id (task deleted/not loaded) resolves to null — the selection is
 * never resurrected from storage without matching task data.
 */
export function validateStoredFocusTaskId(
  storedTaskId: string | null,
  availableTaskIds: ReadonlySet<string>,
): string | null {
  if (!storedTaskId) return null;
  return availableTaskIds.has(storedTaskId) ? storedTaskId : null;
}
