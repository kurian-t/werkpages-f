import { useEffect, useRef, useState } from "react";
import { useDraftSync } from "@/hooks/useDraftSync";
import { useAuth } from "@/hooks/useAuth";
import {
  adoptAnonymousDraft, adoptLegacyDraft, anonymousDraftOffer, scopedDraftKey,
} from "@/lib/draftScope";

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
/** What a form can do about a draft written before anybody signed in. */
export interface AnonymousDraftOffer<T> {
  /** The answers, or null when there is nothing to offer. */
  available: T | null;
  /** Take them into this account's scope. The caller applies them to the form. */
  adopt: () => T | null;
  /** Leave them alone. They stay in the anonymous scope and are not offered again here. */
  dismiss: () => void;
}

export function useFormDraft<T extends object>(
  key: string,
  snapshot: T,
  restore: (saved: T) => void,
  options: {
    ttlMs?: number;
    enabled?: boolean;
    /**
     * Where to also send the draft, so it survives a closed tab rather than only a reload.
     *
     * <p>localStorage alone keeps a form for the person who was filling it in. It does nothing
     * for us: somebody who answers four categories and closes the tab has told us four real
     * things about an employer, and until this existed every one of them was lost.
     *
     * <p>Omitted entirely by forms that should stay local-only, which is the default.
     */
    sync?: {
      /** Absolute URL of the autosave endpoint. */
      url: string;
      /** Stable per form session; what makes repeated saves ONE row rather than dozens. */
      token: string;
      /** Builds the request body from the snapshot. Returns null to skip this save. */
      body: (snapshot: T) => object | null;
      /** Milliseconds of quiet before sending. */
      debounceMs?: number;
    };
  } = {},
) {
  const { ttlMs = 12 * 60 * 60 * 1000, enabled = true, sync } = options;
  const restoredRef = useRef(false);
  const { user } = useAuth();

  /*
    ACCOUNT-SCOPED STORAGE, for every form that uses this hook rather than for whichever page
    remembered to ask.

    The key used to be the subject alone. On a shared browser that meant signing out left the
    answers for the next person, and a second account signing in was shown the first account's
    unfinished rating - which, once a signed-in contributor also saves to the server, is how one
    person's words would be published under another's name.

    adoptLegacyDraft moves a draft written before scoping existed into the anonymous scope, once,
    so shipping this does not orphan every draft somebody had open at the time.
  */
  const scopedKey = scopedDraftKey(key, user?.id);
  const [anonOffer, setAnonOffer] = useState<T | null>(null);
  const migratedRef = useRef(false);
  if (!migratedRef.current) { migratedRef.current = true; adoptLegacyDraft(key); }

  /*
    A draft started before signing in is OFFERED, never adopted silently.

    Adopting it would be right for the usual case - the same person, who just signed in - and
    wrong for the case that matters: a shared browser, where it hands one visitor's answers to
    whoever signs in next. So the form asks.
  */
  /*
    The decision itself lives in draftScope, so this hook and the two forms that do not use it
    cannot disagree about whose draft is whose. It used to be written out here, which is how the
    add-manager and rate-a-manager forms came to have no version of it at all.
  */
  useEffect(() => {
    if (!enabled) { setAnonOffer(null); return; }
    setAnonOffer(anonymousDraftOffer<T & { savedAt?: number }>(key, user?.id, ttlMs) ?? null);
  }, [enabled, user?.id, key, ttlMs]);

  const anonymous: AnonymousDraftOffer<T> = {
    available: anonOffer,
    adopt: () => {
      if (!anonOffer || !user?.id) return null;
      /*
        Returns null if the account acquired its own draft between the offer and this click, in
        another tab. Refusing is the point: adopting would destroy that draft to make room for
        this one.
      */
      const taken = adoptAnonymousDraft<T & { savedAt?: number }>(key, user.id, ttlMs);
      setAnonOffer(null);
      return taken as T | null;
    },
    dismiss: () => setAnonOffer(null),
  };

  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(scopedKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as T & { savedAt?: number };
      if (saved.savedAt && Date.now() - saved.savedAt > ttlMs) {
        localStorage.removeItem(scopedKey);
        return;
      }
      restore(saved);
    } catch {
      // A corrupt or unreadable draft is discarded rather than allowed to break the form it was
      // meant to protect.
      try { localStorage.removeItem(scopedKey); } catch { /* storage unavailable */ }
    }
  }, [scopedKey, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !restoredRef.current) return;
    try {
      localStorage.setItem(scopedKey, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
    } catch {
      // Private mode, or a full quota. Losing the draft is bad; breaking the form is worse.
    }
  }, [scopedKey, enabled, JSON.stringify(snapshot)]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    One sync implementation, shared with the manager-rating form, which keeps its own local draft
    rather than using this hook. Two copies of the debounce-and-flush logic would drift, and the
    half that drifted would quietly stop preserving answers.
  */
  useDraftSync({
    url: sync?.url ?? "",
    token: sync?.token ?? null,
    body: () => (sync ? sync.body(snapshot) : null),
    deps: snapshot,
    enabled: enabled && !!sync && restoredRef.current,
    debounceMs: sync?.debounceMs,
  });

  return { anonymous };
}

/** Removes a draft once its form has actually been finished. */

/*
  SERVER SYNC, debounced, with best-effort flushes.

  The debounce is the mechanism; the lifecycle events are not. visibilitychange and pagehide are
  the closest a browser gets to telling us somebody is leaving, and neither is guaranteed to run:
  a crash, a force-quit or a swipe-away can skip both. So they only flush what is already pending,
  and the periodic save is what actually preserves the answers. The worst case is losing the last
  few seconds of typing, not the form.

  sendBeacon on the way out, because a normal request is cancelled when the page goes away and a
  beacon is not. It is fire-and-forget by design: nothing about the person's experience may depend
  on our bookkeeping succeeding.
*/
export function clearFormDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}
