/**
 * Whose draft is in local storage, and what the server knows about it.
 *
 * <h2>Why a scope exists at all</h2>
 *
 * <p>The local draft key used to be the subject alone, with no account in it. On a shared browser
 * that meant signing out left the answers in place for the next person, and a second account
 * signing in was shown the first account's unfinished rating. Once a signed-in contributor also
 * saves to the server, that device would then write somebody else's words to its own account's
 * draft, from which they could publish them under their own name.
 *
 * <p>So every draft is stored under an account scope. Two rules follow, and both are mandatory:
 *
 * <ul>
 *   <li>a draft written while signed in is only ever read back for THAT account;
 *   <li>signing out does not throw away work the server has not acknowledged - it stays in that
 *       account's scope, where its rightful owner finds it again and nobody else can.
 * </ul>
 */

/** Drafts written by nobody in particular. Deliberately a real scope rather than an absent one. */
export const ANON_SCOPE = "anon";

/**
 * What marks the note left behind when a draft expires.
 *
 * <p>Holds a timestamp and NOTHING ELSE. A form that simply opens empty is indistinguishable from
 * one that threw the answers away, so the person is told; and the note cannot be allowed to become
 * a way of learning what somebody else had typed, so it carries no part of it.
 */
export const EXPIRED_SUFFIX = "__expired";

/**
 * What marks the entry holding what the SERVER knows, as opposed to the answers themselves.
 *
 * <p>Two entries rather than one, because the form rewrites the answers on every keystroke and
 * was wiping the bookkeeping with them.
 */
export const SERVER_META_SUFFIX = "__server";

export function draftScope(userId?: string | null): string {
  return userId && userId.trim() ? userId.trim() : ANON_SCOPE;
}

/**
 * The storage key for a draft, scoped to the account.
 *
 * <p>The separator is deliberately not something an id can contain, so two scopes cannot collide.
 */
export function scopedDraftKey(baseKey: string, userId?: string | null): string {
  return `${baseKey}::${draftScope(userId)}`;
}

/**
 * What the SERVER knows about a locally stored draft, kept beside the answers.
 *
 * <p>Both fields are persisted rather than held in a ref, and that is a correctness requirement
 * rather than a convenience. A `writeId` identifies one immutable write; an interrupted
 * `keepalive` save can commit after the page is gone, so the retry has to carry the SAME id or
 * the server sees a new write with a stale `baseVersion` and reports a cross-device conflict that
 * never happened. A ref is lost on exactly the page load that follows such a save.
 */
export interface ServerDraftMeta {
  /** The version the server last confirmed. Absent means the server has never accepted one. */
  serverVersion?: number;
  /** Set while a write is outstanding, and the id that write must keep across retries. */
  pendingWriteId?: string;
  /** The payload that pendingWriteId names, so a CHANGED answer set gets a new id. */
  pendingFingerprint?: string;
}

/** True when everything typed here has been accepted by the server. */
export function isAcknowledged(meta: ServerDraftMeta | null | undefined): boolean {
  return !!meta && meta.serverVersion != null && !meta.pendingWriteId;
}

function safeGet(key: string): any | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Sign-out housekeeping: forget what the server already has, keep what it does not.
 *
 * <p>Two requirements that pull in opposite directions, and both are mandatory. Nothing one
 * account typed may be shown or submitted under another, and nothing unacknowledged may be thrown
 * away merely because somebody signed out. Scoped storage satisfies the first, so this only has
 * to satisfy the second: an acknowledged draft is redundant locally because the server can return
 * it on any device, and an unacknowledged one is the only copy that exists and stays.
 *
 * @returns the keys removed, for tests and for the caller to log
 */
export function forgetAcknowledgedDrafts(userId: string): string[] {
  const suffix = `::${draftScope(userId)}`;
  const removed: string[] = [];
  let keys: string[] = [];
  try {
    keys = Object.keys(localStorage);
  } catch {
    return removed;   // private mode, or storage disabled
  }
  const drop = (key: string) => {
    try { localStorage.removeItem(key); removed.push(key); } catch { /* ignore */ }
  };
  for (const key of keys) {
    if (!key.endsWith(suffix)) continue;
    const stored = safeGet(key);
    if (!stored) continue;
    /*
      THE ANSWERS AND THE BOOKKEEPING LIVE IN TWO ENTRIES, and only one of them knows whether the
      server has accepted anything.
      The form stores the answers under `<base>::<account>` and useServerDraft stores the
      acknowledged version under `<base>__server::<account>`. They were one entry until the
      form's save was found to be wiping the other. So the state of the SERVER entry decides, and
      when it says the server has everything, BOTH go: keeping the answers alone would leave a
      local copy of something already safe elsewhere, which is the thing sign-out is meant to
      tidy away.
    */
    if (key.endsWith(`${SERVER_META_SUFFIX}${suffix}`)) {
      if (isAcknowledged(stored as ServerDraftMeta)) {
        drop(key);
        drop(key.replace(`${SERVER_META_SUFFIX}${suffix}`, suffix));
      }
    }
  }
  return removed;
}

/**
 * Moves a draft written before scoping existed into the anonymous scope, once.
 *
 * <p>Without this, shipping the scope would silently orphan every draft somebody had open at the
 * time: their key would no longer be the one being read. A draft in progress is exactly what this
 * whole feature exists to protect, so losing a batch of them on the way to protecting them would
 * be its own small outage.
 */
export function adoptLegacyDraft(baseKey: string): void {
  try {
    const legacy = localStorage.getItem(baseKey);
    if (!legacy) return;
    const anon = scopedDraftKey(baseKey, null);
    if (localStorage.getItem(anon) == null) localStorage.setItem(anon, legacy);
    localStorage.removeItem(baseKey);
  } catch {
    // Storage unavailable. Losing the migration is bad; breaking the form is worse.
  }
}

/** A stable fingerprint of an answer set, so a CHANGED payload can be told from a retried one. */
export function fingerprint(payload: unknown): string {
  try {
    return JSON.stringify(payload) ?? "";
  } catch {
    return String(Date.now());
  }
}

/*
  ────────────────────────────────────────────────────────────────────────────────────────────────
  OWNERSHIP, as one implementation that every form uses.

  The scope above decides WHERE a draft is stored. Everything below decides WHOSE it is, which is
  the question the two biggest contribution forms were never asking: they read a key with no
  account in it and poured whatever they found into whoever was looking.

  It lives here, not in `useFormDraft`, because the add-manager and rate-a-manager forms do not
  use that hook - they have their own bespoke restores, for good reasons that have nothing to do
  with ownership - and a second copy of this reasoning in a page is a second copy that will drift.
  CLAUDE.md section 46: one implementation, used by every form.
  ────────────────────────────────────────────────────────────────────────────────────────────────
*/

/**
 * Twenty-four hours, for every scope.
 *
 * <p>Was twelve, which covered somebody who started a rating at 23:00 and came back at 09:00 and
 * did not cover one who started at 19:00 and came back the following lunchtime. The email
 * verification round trip can sit in an inbox overnight, and losing a complete rating to that is
 * losing it to our own flow.
 *
 * <p>What a longer window costs is no longer what it cost. An anonymous draft used to be applied
 * silently to whoever loaded the form next, so every extra hour was an extra hour of cross-account
 * exposure. Now it is offered rather than applied, carries no email address unless the viewer owns
 * it, and cannot auto-submit. What remains is that the next person at a shared browser can press
 * Restore and read the answers, which the TTL bounds and nothing else does.
 */
export const DEFAULT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/** Base keys, named once so a storage slot is never spelled out at a call site again. */
/**
 * THE ONE THING THAT PROVES AN ANONYMOUS DRAFT BELONGS TO WHOEVER JUST SIGNED IN.
 *
 * <p><b>The problem this solves.</b> Drafts are keyed per account. A logged-out contributor fills
 * the form, submits, is sent to Auth0 and comes back signed in - at which point their draft is in
 * the anonymous scope and the form reads the account scope, finds nothing, and opens EMPTY. The
 * work is still on disk; the form just cannot prove it is theirs, so it offers it behind a banner.
 *
 * <p><b>Why a banner is the wrong answer here</b>, even though it is the right answer for a
 * stale draft found lying around. This person filled the form in seconds ago, in this tab, and
 * was sent away by the form itself. Asking them to confirm their own in-flight work is asking
 * them to do the thing CLAUDE.md section 44 exists to prevent: it reads as the answers having
 * been thrown away.
 *
 * <p><b>Why sessionStorage, and why this is not the thing that was rejected.</b> The comment in
 * AddBoss is right that nothing IN a draft can prove ownership: localStorage is writable by
 * anybody with the browser, and a query parameter by anybody who can type. sessionStorage is
 * different in the one way that matters: it is scoped to the TAB. It is created by the redirect
 * and dies with the tab, so the next person to sit down at a shared machine opens a new tab,
 * carries no marker, and still gets the offer rather than a stranger's half-written rating.
 *
 * <p>Short-lived as well as tab-scoped, because a tab left open for hours on the Auth0 page is
 * not evidence of anything.
 */
const AUTH_HANDOFF_KEY = "rmm_auth_handoff_at";
const AUTH_HANDOFF_MAX_AGE_MS = 30 * 60 * 1000;

/** Called by the auth redirect, immediately before the page unloads. */
export function markAuthHandoff(): void {
  try {
    sessionStorage.setItem(AUTH_HANDOFF_KEY, String(Date.now()));
  } catch {
    // Private windows and blocked site data. The form then falls back to offering the draft,
    // which is the old behaviour and is still correct, just one click worse.
  }
}

/**
 * Consumes the marker. True exactly once per round trip.
 *
 * <p>Removed on read, so a second mount of the same form cannot silently adopt a draft a second
 * time, and so a later visitor in a reused tab does not inherit it.
 */
export function takeAuthHandoff(): boolean {
  try {
    const raw = sessionStorage.getItem(AUTH_HANDOFF_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(AUTH_HANDOFF_KEY);
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at <= AUTH_HANDOFF_MAX_AGE_MS;
  } catch {
    return false;
  }
}

export const MANAGER_DRAFT_KEY = "rmm_pending_manager";
export const REVIEW_DRAFT_KEY = "rmm_pending_review";

interface StoredDraft { savedAt?: number }

/**
 * One account's slot for one form.
 *
 * <p>Handed out rather than letting pages touch `localStorage`, because the account is the part
 * that kept being forgotten. There is no way to read or write through this without saying whose
 * draft it is, and the compiler asks at every call site.
 */
export interface DraftSlot<T> {
  /** The resolved storage key. Exposed for tests and for logging, not for reading around this. */
  readonly key: string;
  /** The draft, or null when absent, unreadable or past its TTL. Expired drafts are removed. */
  read(): T | null;
  /** {@link read}, and then remove it. What both forms do: a restore consumes the draft. */
  take(): T | null;
  /** Stores the answers, stamping `savedAt`. Synchronous, which is the point: see below. */
  write(payload: T): void;
  /** Forgets it. */
  clear(): void;
}

export function draftSlot<T extends StoredDraft>(
  baseKey: string,
  userId?: string | null,
  options: { ttlMs?: number } = {},
): DraftSlot<T> {
  const { ttlMs = DEFAULT_DRAFT_TTL_MS } = options;
  const key = scopedDraftKey(baseKey, userId);

  const readRaw = (remove: boolean): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as T;
      if (parsed?.savedAt && Date.now() - parsed.savedAt > ttlMs) {
        localStorage.removeItem(key);
        /*
          Leave a note, so the form can say what happened rather than opening empty and letting
          somebody conclude their work was lost silently. The note is a timestamp; it is not the
          draft, and it is deliberately not a summary of the draft, because whoever reads it may
          not be whoever wrote it.
        */
        try {
          localStorage.setItem(scopedDraftKey(baseKey + EXPIRED_SUFFIX, userId),
                               JSON.stringify({ at: Date.now() }));
        } catch { /* storage unavailable */ }
        return null;
      }
      if (remove) localStorage.removeItem(key);
      return parsed;
    } catch {
      // Corrupt or unreadable. Discarded rather than allowed to break the form it protects.
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
      return null;
    }
  };

  return {
    key,
    read: () => readRaw(false),
    take: () => readRaw(true),
    write: (payload: T) => {
      try {
        localStorage.setItem(key, JSON.stringify({ ...payload, savedAt: Date.now() }));
      } catch {
        // Private mode, or a full quota. Losing the draft is bad; breaking the form is worse.
      }
    },
    clear: () => {
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    },
  };
}

/**
 * Whether a draft expired here since the last time anybody asked, clearing the note.
 *
 * <p>Read once, on mount, by the form that would have restored it. Clearing it on read is what
 * stops the message reappearing on every later visit, long after the person has moved on.
 */
export function takeExpiryNotice(baseKey: string, userId?: string | null): boolean {
  /*
    BOTH SCOPES, and that was a defect for one run.

    The expiry is recorded in the scope the draft was IN. A signed-in person's anonymous draft
    expires under `::anon`, not under their account, so checking only the account scope found
    nothing and the form opened empty and silent - exactly the outcome the notice exists to
    prevent. A browser test caught it.

    Telling them that A draft expired, in either scope, discloses that one existed and nothing
    more, which is what the offer itself would have disclosed.
  */
  const keys = userId && userId.trim()
    ? [scopedDraftKey(baseKey + EXPIRED_SUFFIX, userId),
       scopedDraftKey(baseKey + EXPIRED_SUFFIX, null)]
    : [scopedDraftKey(baseKey + EXPIRED_SUFFIX, null)];
  let found = false;
  for (const key of keys) {
    try {
      if (localStorage.getItem(key) == null) continue;
      localStorage.removeItem(key);
      found = true;
    } catch {
      return found;
    }
  }
  return found;
}

/**
 * A draft written before anybody signed in, for an account that has none of its own.
 *
 * <p>Returns it to be OFFERED. It is deliberately not adopted here, and the distinction is the
 * whole point: this browser cannot tell "the person who just signed in" from "the next person at
 * this machine", and only one of those two wrote it.
 *
 * <p><b>There is no exception to this, and there were two.</b> An anonymous draft carries no
 * identity, so there is nothing on it that can be verified; everything that looked like proof was
 * either a value in localStorage or a query parameter, both of which are written by whoever has
 * the browser. The offer is the answer. What follows from it is bounded deliberately: the answers
 * are applied only when somebody asks for them, the address on the draft is dropped unless it is
 * the viewer's own, and nothing is ever published without a submit.
 *
 * <p>Null when nobody is signed in (there is nothing to offer a draft TO), when the account
 * already has its own draft (offering would mean choosing between two people's work, which is a
 * question for them), or when the anonymous draft is absent or stale.
 */
export function anonymousDraftOffer<T extends StoredDraft>(
  baseKey: string,
  userId?: string | null,
  ttlMs: number = DEFAULT_DRAFT_TTL_MS,
): T | null {
  if (!userId || !userId.trim()) return null;
  const own = draftSlot<T>(baseKey, userId, { ttlMs });
  const anon = draftSlot<T>(baseKey, null, { ttlMs });
  try {
    if (localStorage.getItem(own.key) != null) return null;
  } catch {
    return null;
  }
  return anon.read();
}

/**
 * Takes an anonymous draft into an account, once the person has said it is theirs.
 *
 * <p>REFUSES when that account already has a draft of its own, and returns null. Overwriting
 * would be destroying one person's unfinished work to make room for another's, which is the
 * failure this whole module exists to prevent, inverted.
 */
export function adoptAnonymousDraft<T extends StoredDraft>(
  baseKey: string,
  userId: string,
  ttlMs: number = DEFAULT_DRAFT_TTL_MS,
): T | null {
  const own = draftSlot<T>(baseKey, userId, { ttlMs });
  const anon = draftSlot<T>(baseKey, null, { ttlMs });
  try {
    if (localStorage.getItem(own.key) != null) return null;
  } catch {
    return null;
  }
  const payload = anon.read();
  if (!payload) return null;
  own.write(payload);
  anon.clear();
  return payload;
}

/** Leaves the anonymous draft where it is and stops offering it here. */
export function discardAnonymousDraft(baseKey: string): void {
  draftSlot(baseKey, null).clear();
}

/**
 * Whether the address written on a draft is the signed-in account's own.
 *
 * <h2>This is NOT proof that the draft belongs to them, and it used to be treated as if it were</h2>
 *
 * <p>An earlier version of this module was called {@code draftProvesOwnership} and was used to
 * restore an anonymous draft silently, and to mark it safe to auto-submit. That was wrong.
 * {@code signupEmail} lives in localStorage: anybody who can reach the browser can write it,
 * including the person who left the draft, who may well know which address the next person at a
 * shared machine signs in with. A match says only that whoever wrote the draft knew an address,
 * not that they own it.
 *
 * <p>So the name says what it checks. The only thing it is used for now is deciding whether
 * showing that address DISCLOSES anything: an address equal to the viewer's own tells them nothing
 * they do not already know. It never decides whether answers are applied.
 */
export function emailBelongsToAccount(
  payload: { signupEmail?: unknown } | null | undefined,
  accountEmail?: string | null,
): boolean {
  const claimed = typeof payload?.signupEmail === "string" ? payload.signupEmail.trim() : "";
  const actual = typeof accountEmail === "string" ? accountEmail.trim() : "";
  if (!claimed || !actual) return false;
  return claimed.toLowerCase() === actual.toLowerCase();
}

/**
 * Strips the email address out of a draft whose owner is not established.
 *
 * <p>`signupEmail` is the address somebody typed into the sign-up step, and the forms feed it
 * straight to the "we sent a verification link to ..." screen. Restored from an anonymous draft by
 * a visitor who did not write it, that screen shows one person the private email address of
 * another - on a product whose promise is anonymous workplace feedback.
 *
 * <p>ONE thing keeps it: being signed in as the account whose address it is. That is a fact the
 * server established, and showing somebody their own address discloses nothing.
 *
 * <p>Arrival from the verification link used to count too, on the reasoning that the link was
 * delivered to that address. It does not count any more, because "arrival from the link" was read
 * from {@code ?verified=true} in the URL, which anybody can type. A query parameter is not
 * evidence of anything.
 *
 * <p>Otherwise every other answer is restored and this one field is dropped. The cost is real and
 * small: somebody waiting for a verification email who reloads, or who follows the link, sees the
 * sign-in step without their address pre-filled and types it once. Every answer they gave is
 * still there.
 */
export function withoutUnprovenEmail<T extends { signupEmail?: unknown; emailVerified?: unknown }>(
  payload: T,
  proof: { accountEmail?: string | null },
): T {
  if (!payload || payload.signupEmail == null) return payload;
  if (emailBelongsToAccount(payload, proof.accountEmail)) return payload;
  const { signupEmail, emailVerified, ...rest } = payload as Record<string, unknown>;
  return rest as T;
}

/**
 * A draft from the account's own scope, or failing that the anonymous one, with the key it came
 * from.
 *
 * <p>For the handful of places that only need to LOOK at a draft rather than own it: the two
 * landing pages that read `returnTo` to decide where to send somebody back to, and the sign-up
 * step that stamps the typed email onto whatever draft is in progress. Those run at moments when
 * the person may be signed in or not, and asking them to guess the scope is how a scope gets
 * guessed wrong.
 *
 * <p>Deliberately NOT for restoring answers into a form. That path has to decide whose draft it
 * is, and this function does not: it would hand an anonymous draft straight to a signed-in
 * visitor, which is the defect the rest of this module exists to close.
 */
export function peekAnyScopeDraft<T extends StoredDraft>(
  baseKey: string,
  userId?: string | null,
  ttlMs: number = DEFAULT_DRAFT_TTL_MS,
): { payload: T; key: string } | null {
  const candidates = userId && userId.trim()
    ? [draftSlot<T>(baseKey, userId, { ttlMs }), draftSlot<T>(baseKey, null, { ttlMs })]
    : [draftSlot<T>(baseKey, null, { ttlMs })];
  for (const slot of candidates) {
    const payload = slot.read();
    if (payload) return { payload, key: slot.key };
  }
  return null;
}
