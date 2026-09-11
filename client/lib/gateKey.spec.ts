import { describe, expect, it } from "vitest";
import { gateKey } from "./gateKey";

describe("gateKey", () => {
  it("changes when a reader contributes, so the gated response refetches", () => {
    // The bug this exists to prevent: the profile is cached with its analytics stripped, the
    // reader submits the rating that unlocks it, and the page stays locked until a refresh.
    const before = gateKey({ id: "u1", hasContributed: false });
    const after  = gateKey({ id: "u1", hasContributed: true });
    expect(before).not.toBe(after);
  });

  it("changes when somebody signs in", () => {
    expect(gateKey(null)).not.toBe(gateKey({ id: "u1", hasContributed: false }));
  });

  it("changes when a different person signs in", () => {
    // Two readers can be gated differently, so one must never read the other's cached response.
    expect(gateKey({ id: "u1", hasContributed: true }))
      .not.toBe(gateKey({ id: "u2", hasContributed: true }));
  });

  it("is stable for the same reader in the same state", () => {
    // Otherwise every render refetches.
    expect(gateKey({ id: "u1", hasContributed: true }))
      .toBe(gateKey({ id: "u1", hasContributed: true }));
  });

  it("still separates gate states when the id is missing", () => {
    // A session object without an id is still a session; it must not collapse two gate states
    // into one cache entry.
    expect(gateKey({ hasContributed: false })).not.toBe(gateKey({ hasContributed: true }));
  });

  it("treats a signed-out reader as anonymous", () => {
    expect(gateKey(null)).toBe("anon");
    expect(gateKey(undefined)).toBe("anon");
  });

  it("changes when a workplace rating is submitted", () => {
    // The other gate. Company data is opened by hasRatedCompany, not hasContributed, so a key
    // tracking only the manager gate would leave the Working here tab locked until a refresh.
    expect(gateKey({ id: "u1", hasRatedCompany: false }))
      .not.toBe(gateKey({ id: "u1", hasRatedCompany: true }));
  });

  it("keeps the two gates independent", () => {
    // Rating a manager must not read as having rated the workplace.
    expect(gateKey({ id: "u1", hasContributed: true, hasRatedCompany: false }))
      .not.toBe(gateKey({ id: "u1", hasContributed: true, hasRatedCompany: true }));
  });

  it("treats a missing hasContributed as locked", () => {
    // The field is optional on the user object; absent must not read as unlocked.
    expect(gateKey({ id: "u1" })).toBe(gateKey({ id: "u1", hasContributed: false }));
  });
});
