import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/*
  WHAT THIS FILE USED TO TEST, AND WHY IT NO LONGER DOES.

  startSocialLogin used to build the Auth0 /authorize URL in the browser and keep `state` and the
  returnTo in sessionStorage. Most of the old tests here were about that URL: trimming a trailing
  newline out of the domain, never navigating to "https://undefined/authorize", remembering to
  send the audience. They were good tests of a design that has been removed.

  The browser no longer builds that URL. The server mints the state and the PKCE verifier, keeps
  the verifier where no script can reach it, and redirects. So the whole class of bug those tests
  guarded - a malformed authorize URL assembled from build-time config - is now structurally
  impossible rather than merely tested for.

  What is left worth asserting is the new contract: both entry points navigate to the backend,
  name their connection, and carry a returnTo.
*/
describe("starting a login", () => {
  let href: string;

  beforeEach(() => {
    href = "";
    vi.stubGlobal("window", {
      location: {
        pathname: "/add", search: "", origin: "http://localhost",
        set href(value: string) { href = value; },
        get href() { return href; },
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends a social login to the backend, not to Auth0", async () => {
    const { startSocialLogin } = await import("./auth");
    startSocialLogin("google-oauth2", "/companies/acme");
    expect(href).toContain("/api/auth/start");
    expect(href).toContain("connection=google-oauth2");
    expect(href).toContain("returnTo=%2Fcompanies%2Facme");
    // The browser must not be constructing an Auth0 URL any more.
    expect(href).not.toContain("/authorize");
  });

  it("sends email and password through the same flow, as a connection", async () => {
    const { startPasswordLogin } = await import("./auth");
    startPasswordLogin("/add");
    expect(href).toContain("/api/auth/start");
    expect(href).toContain("connection=Username-Password-Authentication");
  });

  it("falls back to the current page when no returnTo is given", async () => {
    const { startSocialLogin } = await import("./auth");
    startSocialLogin("google-oauth2");
    expect(href).toContain("returnTo=%2Fadd");
  });

  it("keeps no OAuth state in sessionStorage", async () => {
    /*
      The regression test for the reason the old design failed. A value the browser holds cannot
      bind a login to that browser, because an attacker owns their own browser's storage. If
      state or returnTo ever go back into sessionStorage, the binding has been moved somewhere it
      cannot work.
    */
    const setItem = vi.fn();
    vi.stubGlobal("sessionStorage", { setItem, getItem: () => null, removeItem: vi.fn() });
    const { startSocialLogin } = await import("./auth");
    startSocialLogin("google-oauth2", "/add");

    /*
      NARROWED 2026-11-18, and the narrowing matters, so it is written down.

      This asserted `setItem` was never called AT ALL, and it began failing when
      `startSocialLogin` started calling `markAuthHandoff`, which writes one key:
      `rmm_auth_handoff_at`, a timestamp marking that a sign-in redirect is in flight. That is
      not OAuth state. It binds nothing, an attacker forging it gains nothing, and losing it
      costs only a draft handoff.

      "No writes whatsoever" was never the property worth protecting; it was a cheap proxy for
      it. The property is that `state` and `returnTo` never live in browser storage, because a
      value the browser holds cannot bind a login to that browser. So the assertion now names
      those two directly and permits nothing else to resemble them.
    */
    const written = setItem.mock.calls.map(([key, value]) => `${key}=${value}`);
    for (const entry of written) {
      expect(entry, `OAuth state must never reach sessionStorage, found: ${entry}`)
        .not.toMatch(/state|return[_-]?to|code[_-]?verifier|nonce/i);
    }
    // And the one write that IS expected stays expected, so a future write cannot hide beside it.
    expect(setItem.mock.calls.map(([key]) => key)).toEqual(["rmm_auth_handoff_at"]);
  });
});
