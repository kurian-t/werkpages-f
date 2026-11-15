import { useCallback, useEffect, useRef, useState } from "react";
import API_BASE from "@/lib/api";
import {
  SERVER_META_SUFFIX, ServerDraftMeta, fingerprint, isAcknowledged, scopedDraftKey,
} from "@/lib/draftScope";

/**
 * A signed-in contributor's unfinished rating, kept on the server so they can resume it anywhere.
 *
 * <h2>What this is NOT</h2>
 *
 * <p>Not the anonymous capture. {@code useDraftSync} still posts to the capture endpoint for
 * people with no account, unchanged, and that draft reaches moderation because an abandoned
 * anonymous contribution is the thing moderation exists to see. This one is private: nothing
 * written here is read by moderation, and it exists so the person can come back to it.
 *
 * <h2>Three rules that look like details and are not</h2>
 *
 * <ol>
 *   <li><b>A writeId names ONE payload.</b> Retries of the same answers reuse it, so a write
 *       whose acknowledgement was lost is recognised as a replay rather than reported as a
 *       conflict. Answers that CHANGED get a new id, or a delayed response would acknowledge
 *       answers it never carried.
 *   <li><b>writeId and serverVersion are persisted.</b> An unload save can commit after the page
 *       is gone, so the page that comes back is the one that has to carry the id. A ref would be
 *       exactly what the browser threw away.
 *   <li><b>A 409 is never resolved silently.</b> Another device is ahead; the contributor is told
 *       and chooses. Preferring the local side without asking is how somebody's newer answers
 *       disappear, and preferring the server side without asking is how the ones in front of them
 *       do.
 * </ol>
 *
 * <h2>keepalive rather than sendBeacon</h2>
 *
 * <p>A beacon cannot report what the server decided, and this save has a version to learn. On the
 * unload path a beacon's acknowledgement is not occasionally lost, it is never available, which
 * would leave every returning session believing a stale version. {@code fetch} with
 * {@code keepalive} survives the page going away AND returns the response, and
 * {@code credentials: "include"} carries the HttpOnly session cookie the API already accepts.
 */

export type DraftStatus = "idle" | "saving" | "saved" | "conflict" | "unauthenticated" | "offline";

export interface ServerDraftConflict {
  /** The version the server holds, which is ahead of ours. */
  version: number;
  /** The answers it holds, so the contributor can see what they would be choosing. */
  payload: any;
}

export interface UseServerDraft {
  status: DraftStatus;
  /** Set when the server refused a write because another device is ahead. */
  conflict: ServerDraftConflict | null;
  /** A draft the server already had when this form opened, offered rather than applied. */
  offered: { version: number; payload: any } | null;
  /** Take the server's answers. The caller applies them to the form. */
  acceptOffered: () => any | null;
  /** Keep what is on screen. The next save is based on the server's version, so it is accepted. */
  dismissOffered: () => void;
  /** Resolve a conflict by taking the server's copy. Returns the payload to apply. */
  resolveWithServer: () => any | null;
  /** Resolve a conflict by keeping what is on screen, which overwrites the other device. */
  resolveWithLocal: () => void;
}

const RETENTION_NOTICE_DAYS = 90;
export const DRAFT_RETENTION_DAYS = RETENTION_NOTICE_DAYS;

export function useServerDraft(opts: {
  /** The local key this form already uses, unscoped. Scoping happens here. */
  baseKey: string;
  subjectType: "manager" | "company" | "interview";
  subjectId: number | null | undefined;
  /** Which of the person's two rating slots. Defaults to 1. */
  ordinal?: number;
  /** The authenticated account, or null. Null disables everything here. */
  userId: string | null | undefined;
  /** The answers, or null when there is nothing worth keeping yet. */
  payload: () => object | null;
  /** Changes to this re-arm the debounce. */
  deps: unknown;
  enabled?: boolean;
  debounceMs?: number;
}): UseServerDraft {
  const {
    baseKey, subjectType, subjectId, ordinal = 1, userId,
    payload, deps, enabled = true, debounceMs = 3000,
  } = opts;

  const on = !!enabled && !!userId && subjectId != null;
  /*
    ITS OWN KEY, not the form's.

    useFormDraft stores the ANSWERS under the scoped base key and rewrites that entry on every
    change. This hook stores what the SERVER knows - the acknowledged version and the id of the
    write still owed - and the two were sharing one entry, so the form's next save wiped the
    bookkeeping. Measured, not theorised: three replays carried the right id and the fourth
    minted a new one, because by then the snapshot had overwritten it, which turns the
    lost-acknowledgement case straight back into the false conflict this exists to prevent.
  */
  const key = scopedDraftKey(`${baseKey}${SERVER_META_SUFFIX}`, userId);

  const [status, setStatus] = useState<DraftStatus>("idle");
  const [conflict, setConflict] = useState<ServerDraftConflict | null>(null);
  const [offered, setOffered] = useState<{ version: number; payload: any } | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The answers owed a save, and their fingerprint.
   *
   * <p>Deliberately WITHOUT a writeId. The id is settled when a save is actually issued, not
   * when state changes, because a form restoring itself renders several intermediate states on
   * the way back and each one has a different fingerprint. Minting an id per state change
   * overwrote the stored identity of the write that was still owed, which is exactly the
   * acknowledgement-lost case the id exists to survive.
   */
  const pendingRef = useRef<{ body: any; print: string } | null>(null);
  const askedRef = useRef(false);

  // ── the persisted half ────────────────────────────────────────────────────
  const readMeta = useCallback((): ServerDraftMeta => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as ServerDraftMeta) : {};
    } catch {
      return {};
    }
  }, [key]);

  const writeMeta = useCallback((patch: ServerDraftMeta) => {
    try {
      const current = readMeta();
      localStorage.setItem(key, JSON.stringify({ ...current, ...patch }));
    } catch {
      // Private mode or a full quota. The save still goes out; only the bookkeeping is lost.
    }
  }, [key, readMeta]);

  // ── what the server already has, OFFERED rather than applied ──────────────
  useEffect(() => {
    if (!on || askedRef.current) return;
    askedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users/me/drafts`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        const mine = (body?.drafts ?? []).find(
          (d: any) => d.subjectType === subjectType && Number(d.subjectId) === Number(subjectId)
                      && Number(d.ordinal ?? 1) === Number(ordinal));
        if (!mine || cancelled) return;
        const localVersion = readMeta().serverVersion ?? 0;
        if (Number(mine.version) > localVersion) {
          /*
            OFFERED, not applied. Applying it would discard whatever is on screen, which is the
            exact defect fixed in Priority 1 wearing the other face: there, a restore destroyed
            the answers; here, a restore from another device would.
          */
          setOffered({ version: Number(mine.version), payload: mine.payload });
        } else {
          writeMeta({ serverVersion: Number(mine.version) });
        }
      } catch {
        // No answer is not a verdict. The form works; cross-device resume simply is not offered.
      }
    })();
    return () => { cancelled = true; };
  }, [on, subjectType, subjectId, ordinal, readMeta, writeMeta]);

  // ── the debounced save ────────────────────────────────────────────────────
  useEffect(() => {
    if (!on) { if (!userId) setStatus("idle"); return; }
    const next = payload();
    if (!next) return;

    pendingRef.current = { body: next, print: fingerprint(next) };

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void send(false); }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key, subjectType, subjectId, ordinal, JSON.stringify(deps)]);

  const send = useCallback(async (unloading: boolean) => {
    const held = pendingRef.current;
    if (!held || !on) return;
    const meta = readMeta();
    /*
      ONE WRITE, ONE PAYLOAD, settled here because here is where a write actually happens.

      The same answers keep the same id, so a write whose acknowledgement was never seen - which
      on the unload path is every write - is recognised by the server as a replay and answered
      from its stored version instead of reported as a conflict that never happened.

      CHANGED answers get a new id, or a delayed response would acknowledge answers it never
      carried.
    */
    const writeId = (meta.pendingFingerprint === held.print && meta.pendingWriteId)
      ? meta.pendingWriteId
      : crypto.randomUUID();
    writeMeta({ pendingWriteId: writeId, pendingFingerprint: held.print });
    setStatus("saving");
    const body = JSON.stringify({
      subjectType,
      subjectId,
      ordinal,
      payload: held.body,
      ...(meta.serverVersion != null ? { baseVersion: meta.serverVersion } : {}),
      writeId,
    });
    try {
      const res = await fetch(`${API_BASE}/api/users/me/drafts`, {
        method: "PUT",
        // Survives the page going away AND returns the version, which a beacon cannot.
        keepalive: unloading,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.status === 401) {
        /*
          The session expired mid-form. The draft stays local and is NOT cleared: asking somebody
          to sign in again is reasonable, losing what they wrote is not. They are asked at submit,
          never mid-answer.
        */
        setStatus("unauthenticated");
        return;
      }
      const json = await res.json().catch(() => null);
      if (res.status === 409) {
        setStatus("conflict");
        setConflict({ version: Number(json?.version ?? 0), payload: json?.payload });
        return;
      }
      if (!res.ok || !json) { setStatus("offline"); return; }
      // Accepted, or a replay the server recognised. Either way this is where it stands now.
      if (pendingRef.current === held) pendingRef.current = null;
      writeMeta({ serverVersion: Number(json.version), pendingWriteId: undefined,
                  pendingFingerprint: undefined });
      setStatus("saved");
    } catch {
      /*
        The request never arrived. The payload and its writeId are BOTH still held, in storage as
        well as in memory, so the retry is the same write rather than a new one.
      */
      setStatus("offline");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, subjectType, subjectId, ordinal, readMeta, writeMeta]);

  // ── leaving: flush what is owed ───────────────────────────────────────────
  useEffect(() => {
    if (!on) return;
    const flush = () => { if (pendingRef.current) void send(true); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();   // the X and internal navigation fire neither of the above
    };
  }, [on, send]);

  const acceptOffered = useCallback(() => {
    if (!offered) return null;
    writeMeta({ serverVersion: offered.version, pendingWriteId: undefined,
                pendingFingerprint: undefined });
    const p = offered.payload;
    setOffered(null);
    return p;
  }, [offered, writeMeta]);

  const dismissOffered = useCallback(() => {
    if (!offered) return;
    /*
      Keeping what is on screen still means basing the next write on the server's version, or
      every subsequent save would be refused as stale and the person would be stuck.
    */
    writeMeta({ serverVersion: offered.version });
    setOffered(null);
  }, [offered, writeMeta]);

  const resolveWithServer = useCallback(() => {
    if (!conflict) return null;
    writeMeta({ serverVersion: conflict.version, pendingWriteId: undefined,
                pendingFingerprint: undefined });
    pendingRef.current = null;
    const p = conflict.payload;
    setConflict(null);
    setStatus("saved");
    return p;
  }, [conflict, writeMeta]);

  const resolveWithLocal = useCallback(() => {
    if (!conflict) return;
    // Base the next write on where the server actually is, so it is accepted this time.
    writeMeta({ serverVersion: conflict.version });
    setConflict(null);
    if (pendingRef.current) {
      // A deliberate overwrite is a NEW write, not a replay of the refused one.
      writeMeta({ pendingWriteId: undefined, pendingFingerprint: undefined });
      void send(false);
    }
  }, [conflict, writeMeta, send]);

  return { status, conflict, offered, acceptOffered, dismissOffered,
           resolveWithServer, resolveWithLocal };
}

/** Whether everything typed into this form has reached the server. Used by sign-out. */
export function draftIsAcknowledged(baseKey: string, userId: string | null): boolean {
  try {
    const raw = localStorage.getItem(scopedDraftKey(baseKey, userId));
    return isAcknowledged(raw ? JSON.parse(raw) : null);
  } catch {
    return false;
  }
}
