import { useEffect, useRef } from "react";
import axios from "axios";

/**
 * Sends a form's answers to the server while it is still being filled in.
 *
 * <h2>Why the debounce is the mechanism and the lifecycle events are not</h2>
 *
 * <p>`visibilitychange` and `pagehide` are the closest a browser comes to announcing that somebody
 * is leaving, and neither is guaranteed to run: a crash, a force quit or a swipe away can skip
 * both. Anything that relies on them to save is a feature that works until it matters.
 *
 * <p>So the periodic save is what actually preserves the answers, and the events only flush what
 * is already waiting. The worst case is losing the last few seconds of typing rather than the
 * form. Nothing here can promise that a final keystroke survives an abrupt termination, and it
 * does not claim to.
 *
 * <h2>Why a clock rather than a counter</h2>
 *
 * <p>Two tabs open on one form share a draft token, and a counter kept in each tab would collide.
 * A millisecond clock is monotonic within one browser, so the server can order the writes and keep
 * the newest answer instead of whichever request happened to arrive last.
 *
 * <h2>Failure is silent, on purpose</h2>
 *
 * <p>This is bookkeeping that happens behind somebody who is mid-sentence. A refused or failed
 * save is not something they can act on, so nothing about their experience may depend on it.
 */
export function useDraftSync<T>(opts: {
  /** Absolute URL of the autosave endpoint. */
  url: string;
  /** Stable for the life of one form session: what makes repeated saves ONE row. */
  token: string | null;
  /** The current answers. Return null when there is nothing worth keeping yet. */
  body: () => object | null;
  /** Changes to this re-arm the debounce. */
  deps: T;
  enabled?: boolean;
  debounceMs?: number;
}) {
  const { url, token, body, deps, enabled = true, debounceMs = 3000 } = opts;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<object | null>(null);

  useEffect(() => {
    if (!enabled || !token) return;
    const next = body();
    if (!next) return;
    pendingRef.current = { ...next, draftToken: token, revision: Date.now() };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const payload = pendingRef.current;
      if (!payload) return;
      /*
        THE PAYLOAD IS HELD UNTIL THE SERVER CONFIRMS IT, and that ordering is the whole point.

        This used to clear it before posting, which loses the answers whenever the request does
        not arrive. Measured rather than reasoned about: with a 1200ms server and somebody
        navigating inside that window, the browser reports
        "POST net::ERR_ABORTED" with the request sent and never finished - and because the
        pending payload had already been set to null, the flush on unmount had nothing to send,
        even though its sendBeacon is specifically the thing that survives a navigation. A few
        answered questions went nowhere, and no test could see it: every other test in this file
        records when a request is MADE, so an aborted one counted as a save.

        THE IDENTITY CHECK is not defensive clutter. A newer payload may have replaced this one
        while it was in flight - somebody answered another row - and that one is still owed a
        save. Clearing unconditionally on success would discard it.
      */
      void axios.post(url, payload)
        .then(() => { if (pendingRef.current === payload) pendingRef.current = null; })
        .catch(() => {});
    }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [enabled, url, token, JSON.stringify(deps)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !token) return;
    const flush = () => {
      const payload = pendingRef.current;
      if (!payload) return;
      pendingRef.current = null;
      /*
        sendBeacon, because an ordinary request is cancelled when the page goes away and a beacon
        is not. Falls back to a normal post where it is unavailable or refuses the payload.
      */
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        if (!navigator.sendBeacon?.(url, blob)) void axios.post(url, payload).catch(() => {});
      } catch {
        void axios.post(url, payload).catch(() => {});
      }
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    // Unmount covers the X and internal navigation, which fire neither of the above.
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [enabled, url, token]); // eslint-disable-line react-hooks/exhaustive-deps
}
