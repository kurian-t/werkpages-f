import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  ANON_SCOPE, EXPIRED_SUFFIX, adoptAnonymousDraft, adoptLegacyDraft, anonymousDraftOffer,
  draftScope, draftSlot, emailBelongsToAccount, forgetAcknowledgedDrafts, isAcknowledged,
  scopedDraftKey, takeExpiryNotice, withoutUnprovenEmail,
} from "./draftScope";

/**
 * Whose draft is in local storage, and what sign-out is allowed to throw away.
 *
 * <p>Pure storage logic, tested here rather than in a browser: the rules are small, the
 * consequences are not, and two of them pull in opposite directions.
 */

function store(init: Record<string, string> = {}) {
  let data: Record<string, string> = { ...init };
  const mock = {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
    clear: () => { data = {}; },
    key: (i: number) => Object.keys(data)[i] ?? null,
    get length() { return Object.keys(data).length; },
  };
  // Object.keys(localStorage) is what the implementation walks, so the keys must be enumerable.
  vi.stubGlobal("localStorage", new Proxy(mock as any, {
    ownKeys: () => Object.keys(data),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (t, prop) => (prop in t ? (t as any)[prop] : data[prop as string]),
  }));
  return () => ({ ...data });
}

describe("draft scoping", () => {
  beforeEach(() => { store(); });

  it("names the anonymous scope rather than leaving it absent", () => {
    expect(draftScope(null)).toBe(ANON_SCOPE);
    expect(draftScope("   ")).toBe(ANON_SCOPE);
    expect(draftScope("user-7")).toBe("user-7");
  });

  it("keeps two accounts' drafts in different places", () => {
    expect(scopedDraftKey("rating_acme", "a")).not.toBe(scopedDraftKey("rating_acme", "b"));
    expect(scopedDraftKey("rating_acme", "a")).toBe("rating_acme::a");
  });

  it("treats a draft as acknowledged only when nothing is still owed", () => {
    expect(isAcknowledged({ serverVersion: 3 })).toBe(true);
    expect(isAcknowledged({ serverVersion: 3, pendingWriteId: "w" })).toBe(false);
    expect(isAcknowledged({})).toBe(false);
    expect(isAcknowledged(null)).toBe(false);
  });
});

describe("sign-out", () => {
  it("forgets what the server has and keeps what it does not", () => {
    /*
      TWO REQUIREMENTS THAT PULL IN OPPOSITE DIRECTIONS, and both are mandatory.

      Nothing one account typed may be readable under another. And nothing the server has not
      accepted may be discarded merely because somebody signed out: that draft is the only copy of
      those answers that exists anywhere.
    */
    const read = store({
      // Acknowledged: the answers and the bookkeeping that says the server has them.
      "rating_acme::me":           JSON.stringify({ draft: { overall: 4 } }),
      "rating_acme__server::me":   JSON.stringify({ serverVersion: 4 }),
      // Owed: a write the server has never answered.
      "rating_lime::me":           JSON.stringify({ draft: { overall: 2 } }),
      "rating_lime__server::me":   JSON.stringify({ serverVersion: 4, pendingWriteId: "w-1" }),
      // Somebody else's.
      "rating_other::you":         JSON.stringify({ draft: { overall: 1 } }),
      "rating_other__server::you": JSON.stringify({ serverVersion: 1 }),
    });

    forgetAcknowledgedDrafts("me");

    const after = read();
    expect(after["rating_acme::me"], "the server already has these answers, so the local copy goes")
      .toBeUndefined();
    expect(after["rating_acme__server::me"], "and its bookkeeping with them").toBeUndefined();
    expect(after["rating_lime::me"], "the server does NOT have these, so this is the only copy")
      .toBeDefined();
    expect(after["rating_lime__server::me"], "so its bookkeeping stays too").toBeDefined();
    expect(after["rating_other::you"], "and another account's drafts are never touched")
      .toBeDefined();
  });

  it("leaves everything alone when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      get length(): number { throw new Error("denied"); },
      getItem() { throw new Error("denied"); },
    } as any);
    expect(() => forgetAcknowledgedDrafts("me")).not.toThrow();
  });
});

describe("the migration into scoped storage", () => {
  it("moves a draft written before scoping existed into the anonymous scope", () => {
    /*
      Without this, shipping the scope would orphan every draft somebody had open at the time:
      their key would no longer be the one being read. Losing a batch of drafts on the way to
      protecting drafts would be its own small outage.
    */
    const read = store({ "rating_acme": JSON.stringify({ draft: { overall: 4 } }) });

    adoptLegacyDraft("rating_acme");

    const after = read();
    expect(after["rating_acme"], "the unscoped key is gone").toBeUndefined();
    expect(after["rating_acme::anon"], "and its answers are in the anonymous scope").toBeDefined();
  });

  it("does not overwrite a scoped draft that already exists", () => {
    const read = store({
      "rating_acme": JSON.stringify({ draft: { overall: 1 } }),
      "rating_acme::anon": JSON.stringify({ draft: { overall: 5 } }),
    });

    adoptLegacyDraft("rating_acme");

    expect(JSON.parse(read()["rating_acme::anon"]).draft.overall,
      "the newer scoped draft wins; the legacy one is only a fallback").toBe(5);
  });
});

/**
 * OWNERSHIP, which is the half that was missing.
 *
 * <p>The scoping tests above prove drafts are stored apart. These prove the rules for deciding
 * whose a draft is, and every one of them corresponds to something the add-manager or
 * rate-a-manager form did wrong: it read a key with no account in it and applied whatever it
 * found to whoever was looking.
 */
describe("draft ownership", () => {
  const BASE = "rmm_pending_manager";
  const ANSWERS = { firstName: "Jordan", savedAt: Date.now() };

  beforeEach(() => { store(); });

  it("reads and writes only within one account's scope", () => {
    const mine = draftSlot<any>(BASE, "user-a");
    const theirs = draftSlot<any>(BASE, "user-b");
    mine.write(ANSWERS);
    expect(mine.read()).toMatchObject({ firstName: "Jordan" });
    expect(theirs.read()).toBeNull();
  });

  it("stamps savedAt on every write, because the TTL is the only thing that expires a draft", () => {
    const slot = draftSlot<any>(BASE, "user-a");
    slot.write({ firstName: "Jordan" } as any);
    expect(typeof slot.read()?.savedAt).toBe("number");
  });

  it("take consumes the draft and read does not", () => {
    const slot = draftSlot<any>(BASE, "user-a");
    slot.write(ANSWERS);
    expect(slot.read()).not.toBeNull();
    expect(slot.read()).not.toBeNull();
    expect(slot.take()).not.toBeNull();
    expect(slot.read()).toBeNull();
  });

  it("discards a draft past its TTL rather than restoring stale answers", () => {
    const slot = draftSlot<any>(BASE, "user-a", { ttlMs: 1000 });
    // Seeded directly: write() stamps savedAt with the current time, deliberately, so it cannot
    // be used to plant an old draft. That is asserted just above.
    localStorage.setItem(slot.key, JSON.stringify({ firstName: "Jordan", savedAt: Date.now() - 5000 }));
    expect(slot.read()).toBeNull();
    // and removes it, so it is not re-examined on every mount
    expect(draftSlot<any>(BASE, "user-a").read()).toBeNull();
  });

  it("leaves a note when it discards an expired draft, and the note carries nothing", () => {
    /*
      A form that opens empty is indistinguishable from one that threw the answers away, so the
      expiry is recorded and the form can say so. The note is a timestamp: whoever reads the
      message may not be whoever typed the draft, so it must not summarise it.
    */
    const slot = draftSlot<any>(BASE, "user-a", { ttlMs: 1000 });
    localStorage.setItem(slot.key, JSON.stringify({
      firstName: "Jordan", signupEmail: "private@example.invalid", savedAt: Date.now() - 5000,
    }));
    expect(slot.read()).toBeNull();

    const note = localStorage.getItem(scopedDraftKey(`${BASE}${EXPIRED_SUFFIX}`, "user-a"));
    expect(note).not.toBeNull();
    expect(note).not.toContain("Jordan");
    expect(note).not.toContain("private@example.invalid");

    // Read once, then gone, so the message does not reappear for weeks afterwards.
    expect(takeExpiryNotice(BASE, "user-a")).toBe(true);
    expect(takeExpiryNotice(BASE, "user-a")).toBe(false);
  });

  it("notices an expiry in the account's own scope and in the anonymous one", () => {
    /*
      Both, because the expiry is recorded in the scope the draft was IN: a signed-in person's
      anonymous draft expires under `::anon`, not under their account. Checking only the account
      scope left the form empty and silent, which is the outcome the notice exists to prevent.
    */
    const own = draftSlot<any>(BASE, "user-a", { ttlMs: 1000 });
    localStorage.setItem(own.key, JSON.stringify({ firstName: "Jordan", savedAt: Date.now() - 5000 }));
    own.read();
    expect(takeExpiryNotice(BASE, "user-b"), "one account's expiry is not another's").toBe(false);
    expect(takeExpiryNotice(BASE, "user-a")).toBe(true);

    const anon = draftSlot<any>(BASE, null, { ttlMs: 1000 });
    localStorage.setItem(anon.key, JSON.stringify({ firstName: "Jordan", savedAt: Date.now() - 5000 }));
    anon.read();
    expect(takeExpiryNotice(BASE, "user-a"),
      "a signed-in person is told about the anonymous draft that expired here").toBe(true);
  });

  it("keeps a draft for a full day, which is the window the email round trip needs", () => {
    const slot = draftSlot<any>(BASE, "user-a");          // the default TTL
    localStorage.setItem(slot.key, JSON.stringify({
      firstName: "Jordan", savedAt: Date.now() - 23 * 60 * 60 * 1000,
    }));
    expect(slot.read(), "23 hours old is still theirs").not.toBeNull();

    localStorage.setItem(slot.key, JSON.stringify({
      firstName: "Jordan", savedAt: Date.now() - 25 * 60 * 60 * 1000,
    }));
    expect(slot.read(), "25 hours old is gone").toBeNull();
  });

  it("survives unreadable storage instead of breaking the form it protects", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    });
    const slot = draftSlot<any>(BASE, "user-a");
    expect(() => slot.write(ANSWERS)).not.toThrow();
    expect(slot.read()).toBeNull();
    expect(() => slot.clear()).not.toThrow();
  });

  it("discards a corrupt draft rather than throwing out of the restore", () => {
    const slot = draftSlot<any>(BASE, "user-a");
    localStorage.setItem(slot.key, "{not json");
    expect(slot.read()).toBeNull();
    expect(localStorage.getItem(slot.key)).toBeNull();
  });

  describe("the anonymous offer", () => {
    it("offers an anonymous draft to an account that has none of its own", () => {
      draftSlot<any>(BASE, null).write(ANSWERS);
      expect(anonymousDraftOffer<any>(BASE, "user-a")).toMatchObject({ firstName: "Jordan" });
    });

    it("offers nothing when nobody is signed in: there is no account to offer it to", () => {
      draftSlot<any>(BASE, null).write(ANSWERS);
      expect(anonymousDraftOffer<any>(BASE, null)).toBeNull();
      expect(anonymousDraftOffer<any>(BASE, "  ")).toBeNull();
    });

    it("offers nothing when the account already has its own draft", () => {
      /*
        Offering here would mean asking somebody to choose between their own unfinished work and
        a stranger's, with no way to tell which is which. The account's own draft wins and the
        anonymous one is left alone.
      */
      draftSlot<any>(BASE, null).write({ firstName: "Stranger", savedAt: Date.now() } as any);
      draftSlot<any>(BASE, "user-a").write(ANSWERS);
      expect(anonymousDraftOffer<any>(BASE, "user-a")).toBeNull();
    });

    it("offers nothing when the anonymous draft is stale", () => {
      localStorage.setItem(
        draftSlot<any>(BASE, null).key,
        JSON.stringify({ firstName: "Jordan", savedAt: Date.now() - 50_000 }));
      expect(anonymousDraftOffer<any>(BASE, "user-a", 1000)).toBeNull();
    });

    it("does not consume the draft it offers", () => {
      // The person has not said it is theirs yet. Consuming on the offer would destroy it for
      // the person who actually wrote it if they declined, or simply reloaded.
      draftSlot<any>(BASE, null).write(ANSWERS);
      anonymousDraftOffer<any>(BASE, "user-a");
      expect(draftSlot<any>(BASE, null).read()).not.toBeNull();
    });
  });

  describe("adoption", () => {
    it("moves the draft into the account and clears the anonymous copy", () => {
      draftSlot<any>(BASE, null).write(ANSWERS);
      expect(adoptAnonymousDraft<any>(BASE, "user-a")).toMatchObject({ firstName: "Jordan" });
      expect(draftSlot<any>(BASE, "user-a").read()).toMatchObject({ firstName: "Jordan" });
      expect(draftSlot<any>(BASE, null).read()).toBeNull();
    });

    it("REFUSES when the account already has a draft, and leaves both alone", () => {
      /*
        The requirement in the reviewer's own words: adoption "must not overwrite a different
        user's saved work". This is that failure inverted - destroying the signed-in person's
        unfinished work to make room for an anonymous draft that may not even be theirs.

        It can happen between the offer and the click: another tab, the same account.
      */
      draftSlot<any>(BASE, null).write({ firstName: "Stranger", savedAt: Date.now() } as any);
      draftSlot<any>(BASE, "user-a").write(ANSWERS);
      expect(adoptAnonymousDraft<any>(BASE, "user-a")).toBeNull();
      expect(draftSlot<any>(BASE, "user-a").read()).toMatchObject({ firstName: "Jordan" });
      expect(draftSlot<any>(BASE, null).read()).toMatchObject({ firstName: "Stranger" });
    });

    it("adopts nothing when there is nothing to adopt", () => {
      expect(adoptAnonymousDraft<any>(BASE, "user-a")).toBeNull();
    });

    it("leaves the anonymous draft in place when it is declined", () => {
      // Declining says "not mine", not "destroy it". Its owner may still come back for it.
      draftSlot<any>(BASE, null).write(ANSWERS);
      expect(draftSlot<any>(BASE, null).read()).not.toBeNull();
    });
  });

  describe("whether an address is the viewer's own", () => {
    /*
      This used to be called draftProvesOwnership and used to decide whether an anonymous draft
      was applied silently and marked safe to auto-submit. It does not decide that any more, and
      the rename is the point: a `signupEmail` in localStorage is written by whoever has the
      browser, so a match says somebody knew an address, not that they own it. All it settles now
      is whether showing that address to this viewer would disclose anything.
    */
    it("recognises the viewer's own address", () => {
      expect(emailBelongsToAccount({ signupEmail: "a@example.com" }, "a@example.com")).toBe(true);
      expect(emailBelongsToAccount({ signupEmail: " A@Example.COM " }, "a@example.com")).toBe(true);
    });

    it("refuses everything else, including the empty cases", () => {
      expect(emailBelongsToAccount({ signupEmail: "a@example.com" }, "b@example.com")).toBe(false);
      expect(emailBelongsToAccount({}, "a@example.com")).toBe(false);
      expect(emailBelongsToAccount({ signupEmail: "a@example.com" }, null)).toBe(false);
      expect(emailBelongsToAccount(null, "a@example.com")).toBe(false);
      // Two blanks are not a match, however equal they look.
      expect(emailBelongsToAccount({ signupEmail: "" }, "")).toBe(false);
    });
  });

  describe("the email on an unproven draft", () => {
    const draft = { firstName: "Jordan", signupEmail: "private@example.invalid", emailVerified: false };

    it("is dropped, while every other answer is kept", () => {
      /*
        The restore fed `signupEmail` to the "we sent a verification link to ..." screen, which
        renders it. On a shared browser that showed one visitor the private address of the last
        one, on a product whose promise is anonymity.
      */
      const guarded = withoutUnprovenEmail(draft, {});
      expect(guarded).not.toHaveProperty("signupEmail");
      expect(guarded).not.toHaveProperty("emailVerified");
      expect(guarded.firstName).toBe("Jordan");
    });

    it("is NOT kept merely because the page was loaded from a verification link", () => {
      /*
        It used to be. "They followed the link in the email" was read from `?verified=true` in the
        URL, which anybody can type, so arriving at /add?verified=true was enough to be handed the
        address off somebody else's draft. A query parameter is not evidence.

        The parameter is gone from this function's signature entirely, so it cannot come back by
        somebody passing it again.
      */
      expect(withoutUnprovenEmail(draft, {} as any)).not.toHaveProperty("signupEmail");
    });

    it("is kept when it is the signed-in account's own address", () => {
      expect(withoutUnprovenEmail(draft, { accountEmail: "private@example.invalid" }))
        .toHaveProperty("signupEmail", "private@example.invalid");
    });

    it("leaves a draft with no email alone", () => {
      const plain = { firstName: "Jordan" } as any;
      expect(withoutUnprovenEmail(plain, {})).toBe(plain);
    });
  });
});
