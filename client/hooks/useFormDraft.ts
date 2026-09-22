import { useEffect, useRef } from "react";

/**
 * Keeping what somebody typed, for every contribution form.
 *
 * <p>The add-manager and rate-a-manager forms each grew their own draft: their own storage key,
 * their own TTL, their own restore effect, their own idea of what was worth keeping. The workplace
 * rating and interview forms grew none at all, so a refresh threw away everything - which is what
 * this exists to stop being a per-form decision.
 *
 * <p><b>Restores once, on mount.</b> A form is a conversation with one person; re-applying stored
 * answers while they are typing would fight them for the cursor.
 *
 * <p><b>Saves on every change.</b> There is no "save" button on a draft and there should not be:
 * the moment work can be lost is the moment nobody is thinking about saving it.
 *
 * <p><b>Expires.</b> A draft is an unfinished thought, not a document. After the TTL it is gone,
 * so a form opened months later is a fresh one.
 */
export function useFormDraft<T extends object>(
  key: string,
  snapshot: T,
  restore: (saved: T) => void,
  options: { ttlMs?: number; enabled?: boolean } = {},
) {
  const { ttlMs = 12 * 60 * 60 * 1000, enabled = true } = options;
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw) as T & { savedAt?: number };
      if (saved.savedAt && Date.now() - saved.savedAt > ttlMs) {
        localStorage.removeItem(key);
        return;
      }
      restore(saved);
    } catch {
      // A corrupt or unreadable draft is discarded rather than allowed to break the form it was
      // meant to protect.
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    }
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !restoredRef.current) return;
    try {
      localStorage.setItem(key, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
    } catch {
      // Private mode, or a full quota. Losing the draft is bad; breaking the form is worse.
    }
  }, [key, enabled, JSON.stringify(snapshot)]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Removes a draft once its form has actually been finished. */
export function clearFormDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}
