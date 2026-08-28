import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Guards the build-time failure modes for social login:
 *
 *  1. An Auth0 value baked into the bundle with a trailing newline puts a control character
 *     inside the /authorize hostname.
 *  2. A build with the Auth0 vars missing entirely renders buttons that navigate to
 *     "https://undefined/authorize".
 *  3. A build missing VITE_AUTH0_AUDIENCE gets an opaque access token back from Auth0, which
 *     then fails JWT validation on every API call.
 *
 * The module reads import.meta.env at import time, so each case re-imports with a stubbed env.
 */
async function loadAuth(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("VITE_AUTH0_DOMAIN", env.VITE_AUTH0_DOMAIN ?? "");
  vi.stubEnv("VITE_AUTH0_CLIENT_ID", env.VITE_AUTH0_CLIENT_ID ?? "");
  vi.stubEnv("VITE_AUTH0_AUDIENCE", env.VITE_AUTH0_AUDIENCE ?? "https://api.werkpages.com/");
  return await import("./auth");
}

const CONFIGURED = {
  VITE_AUTH0_DOMAIN: "ratemymanager.ca.auth0.com",
  VITE_AUTH0_CLIENT_ID: "client-123",
  VITE_AUTH0_AUDIENCE: "https://api.werkpages.com/",
};

describe("Auth0 build-time config", () => {
  let hrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    hrefSetter = vi.fn();
    // The suite runs in the node environment - provide only what lib/auth touches.
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    vi.stubGlobal("window", {
      location: {
        origin: "https://werkpages.com",
        pathname: "/find",
        search: "",
        set href(v: string) {
          hrefSetter(v);
        },
        get href() {
          return "https://werkpages.com/find";
        },
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("trims a trailing newline off the Auth0 domain", async () => {
    const auth = await loadAuth({ ...CONFIGURED, VITE_AUTH0_DOMAIN: "ratemymanager.ca.auth0.com\n" });
    expect(auth.AUTH0_DOMAIN).toBe("ratemymanager.ca.auth0.com");
  });

  it("trims surrounding whitespace off the client id", async () => {
    const auth = await loadAuth({ ...CONFIGURED, VITE_AUTH0_CLIENT_ID: "  client-123\n" });
    expect(auth.AUTH0_CLIENT_ID).toBe("client-123");
  });

  it("trims surrounding whitespace off the audience", async () => {
    const auth = await loadAuth({
      ...CONFIGURED,
      VITE_AUTH0_AUDIENCE: "  https://api.werkpages.com/\n",
    });
    expect(auth.AUTH0_AUDIENCE).toBe("https://api.werkpages.com/");
  });

  it("builds an authorize URL with no control characters in the host", async () => {
    const auth = await loadAuth({ ...CONFIGURED, VITE_AUTH0_DOMAIN: "ratemymanager.ca.auth0.com\n" });
    auth.startSocialLogin("google-oauth2");

    expect(hrefSetter).toHaveBeenCalledTimes(1);
    const url = hrefSetter.mock.calls[0][0] as string;
    expect(url).not.toMatch(/[\n\r\t]/);
    expect(new URL(url).host).toBe("ratemymanager.ca.auth0.com");
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(
      "https://werkpages.com/auth/callback"
    );
    expect(new URL(url).searchParams.get("connection")).toBe("google-oauth2");
  });

  it("sends the audience on the authorize URL so Auth0 issues a JWT access token", async () => {
    const auth = await loadAuth(CONFIGURED);
    auth.startSocialLogin("google-oauth2");

    const url = hrefSetter.mock.calls[0][0] as string;
    expect(new URL(url).searchParams.get("audience")).toBe("https://api.werkpages.com/");
    // openid must survive alongside the audience - handleCallback calls /userinfo with this token.
    expect(new URL(url).searchParams.get("scope")).toBe("openid profile email");
  });

  it("requests the Werkpages API, not RateMyManagers - the two share a tenant", async () => {
    const auth = await loadAuth(CONFIGURED);
    auth.startSocialLogin("google-oauth2");

    const audience = new URL(hrefSetter.mock.calls[0][0] as string).searchParams.get("audience");
    expect(audience).not.toBe("https://api.ratemymanager.com/");
  });

  it("reports social login as unconfigured when the domain is missing", async () => {
    const auth = await loadAuth({ ...CONFIGURED, VITE_AUTH0_DOMAIN: "" });
    expect(auth.isSocialLoginConfigured()).toBe(false);
  });

  it("reports social login as unconfigured when the client id is missing", async () => {
    const auth = await loadAuth({ ...CONFIGURED, VITE_AUTH0_CLIENT_ID: "" });
    expect(auth.isSocialLoginConfigured()).toBe(false);
  });

  it("reports social login as unconfigured when the audience is missing", async () => {
    const auth = await loadAuth({ ...CONFIGURED, VITE_AUTH0_AUDIENCE: "" });
    expect(auth.isSocialLoginConfigured()).toBe(false);
  });

  it("reports social login as configured when all three values are present", async () => {
    const auth = await loadAuth(CONFIGURED);
    expect(auth.isSocialLoginConfigured()).toBe(true);
  });

  it("never navigates to https://undefined/authorize when the config is missing", async () => {
    const auth = await loadAuth({
      VITE_AUTH0_DOMAIN: "",
      VITE_AUTH0_CLIENT_ID: "",
      VITE_AUTH0_AUDIENCE: "",
    });
    auth.startSocialLogin("google-oauth2");
    expect(hrefSetter).not.toHaveBeenCalled();
  });

  it("stores the OAuth state and returnTo before redirecting", async () => {
    const auth = await loadAuth(CONFIGURED);
    auth.startSocialLogin("google-oauth2", "/add");

    const state = sessionStorage.getItem("oauth_state");
    expect(state).toBeTruthy();
    expect(sessionStorage.getItem("oauth_return_to")).toBe("/add");
    // The state in the URL must match what was stored, or AuthCallback cannot verify it.
    const url = hrefSetter.mock.calls[0][0] as string;
    expect(new URL(url).searchParams.get("state")).toBe(state);
  });
});
