import { test, expect } from "./base";
import type { APIRequestContext } from "@playwright/test";

/**
 * EVERY WAY IN, AGAINST THE REAL BACKEND.
 *
 * <p>The companion to signin.spec.ts. That one proves the browser asks the right question; this
 * one proves the backend answers it with a redirect Auth0 will accept.
 *
 * <p><b>Why it has to be live.</b> Mocking `/api/auth/start` would test the mock. The failure this
 * exists for is a backend that is not answering at all: on 17 November the Werkpages backend was
 * down and every sign-in button returned HTTP 500, while 4,640 Playwright specs passed, because
 * the suite mocks authentication end to end. Nothing in a mocked suite can notice that.
 *
 * <p><b>How to run it.</b> It is its own Playwright project, excluded from the default suite:
 *
 * <pre>
 *   pnpm test:signin        # SIGNIN_LIVE=1 playwright test --project=signin-live
 * </pre>
 *
 * <p>Both servers have to be up. tools/preflight/check-signin.sh makes the same checks without
 * Playwright and is the quicker thing to reach for.
 *
 * <p><b>Why it is not in the bulk suite.</b> Two reasons, and the second was learned the hard
 * way. CI runs the built client with no backend behind it, so every check here would fail for an
 * environmental reason. And `/api/auth/start` is RATE LIMITED: a full suite run drains that
 * limiter by itself, so inside the bulk run this spec failed with 429 - 21 of them - for a reason
 * with nothing to do with sign-in. A test that fails environmentally is one somebody deletes
 * within a month, which would cost exactly the coverage it exists to add.
 *
 * <p><b>What it proves, and what it does not.</b> It proves the hop this product owns: the
 * redirect carries the right tenant, the right client, the right audience for THIS product, a
 * callback matching where the browser is, and a PKCE challenge. It cannot complete the flow,
 * because that needs a real Google password - but it does establish that any failure past this
 * point is Auth0 configuration rather than ours, which is the distinction that has cost hours
 * more than once.
 */

/*
  CI has no backend. Stated once, at the top, so a failure here is never mistaken for a
  configuration problem in the pipeline.
*/
test.skip(!!process.env.CI, "CI runs the client with no backend; there is nothing to redirect.");

/** Which product this is, taken from the audience its backend is configured with. */
const EXPECTED_AUDIENCE = process.env.SIGNIN_EXPECT_AUDIENCE
  ?? (process.env.PLAYWRIGHT_BASE_URL?.includes("8080") ? "api.ratemymanager.com" : undefined);

interface AuthorizeUrl {
  tenant: string;
  params: URLSearchParams;
}

/** The auth limiter's window, which is what a 429 here means we have to sit out. */
const LIMITER_WINDOW_MS = 60_000;

/**
 * A GET that waits out the rate limiter rather than reporting it as a sign-in defect.
 *
 * <p>`/api/auth/start` is limited to 10 requests a minute per IP on a 60 second window. This spec
 * makes eight calls, so it fits a cold limiter and not a warm one - and the limiter is warm for a
 * minute after anything else has talked to the backend, a full Playwright run most of all.
 *
 * <p>Waiting once is the honest response. Treating 429 as a skip would make the spec silently
 * stop proving anything, and treating it as a failure reports a defect that is not there: the
 * run immediately after a full suite failed seven of eight checks on a backend that was answering
 * every one of them correctly.
 */
async function patientGet(request: APIRequestContext, url: string) {
  let res = await request.get(url, { maxRedirects: 0, timeout: 30_000 });
  if (res.status() === 429) {
    await new Promise(resolve => setTimeout(resolve, LIMITER_WINDOW_MS + 1_000));
    res = await request.get(url, { maxRedirects: 0, timeout: 30_000 });
  }
  return res;
}

/**
 * Asks the backend for a sign-in redirect and returns the Auth0 URL it chose.
 *
 * <p>`maxRedirects: 0` because the point is the redirect itself. Following it would reach Auth0
 * and turn a precise assertion about our own output into a test of somebody else's login page.
 */
async function authorizeUrlFor(request: APIRequestContext, query: string): Promise<AuthorizeUrl> {
  const res = await patientGet(request, `/api/auth/start?${query}`);

  if (res.status() !== 302) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    /*
      A 500 here is almost always the VITE PROXY reporting that it could not reach the backend,
      not the backend answering badly: through a proxy a refused connection arrives as a 500 with
      a text body rather than as a connection error. Saying so turns a confusing failure into an
      actionable one, which is the whole reason this spec is worth having.
    */
    const hint = res.status() === 429
      ? " - the RATE LIMITER is drained, not a sign-in defect. A full Playwright run does this"
        + " by itself, which is why this spec is its own project: run `pnpm test:signin` alone,"
        + " or wait for the window to pass."
      : res.status() === 500
      ? " - this is the Vite proxy failing, not Auth0. Is the backend running?"
      : res.status() === 401
      ? " - the endpoint is demanding a token it should not; check `security: []` in openapi.yaml."
      : res.status() === 404 || res.status() === 501
      ? " - the operation is not wired; check addHandlerByOperationId for socialAuthStart."
      : "";
    throw new Error(
      `GET /api/auth/start?${query} answered ${res.status()}, expected a 302${hint}\n${body}`);
  }

  const location = res.headers()["location"];
  expect(location, "a 302 with no Location header").toBeTruthy();
  const url = new URL(location!);
  expect(url.pathname, `redirected to ${url.href}, which is not an Auth0 /authorize URL`)
    .toBe("/authorize");
  return { tenant: url.host, params: url.searchParams };
}

/** The assertions every path shares, so a new provider inherits them by being added to the list. */
function expectSoundAuthorizeUrl({ tenant, params }: AuthorizeUrl) {
  expect(tenant, "the redirect does not point at an Auth0 tenant").toMatch(/\.auth0\.com$/);

  // A client id must be there and look like one. Its value is not asserted: it differs per
  // environment, and a test that pins it becomes a test of somebody's .env file.
  expect(params.get("client_id") ?? "", "no usable client_id in the redirect")
    .toMatch(/^[A-Za-z0-9_-]{10,}$/);

  /*
    THE AUDIENCE IDENTIFIES THE PRODUCT, and it is the single most valuable assertion here.

    RateMyManagers once sent `api.werkpages.com`, so Auth0 validated the request against the
    WERKPAGES application - and a callback URL correctly registered on the RateMyManagers
    application was never consulted. The symptom was "Callback URL mismatch", which sends you to
    the Auth0 dashboard to fix something that was never broken.
  */
  if (EXPECTED_AUDIENCE) {
    expect(params.get("audience"), "this is another product's Auth0 application")
      .toBe(`https://${EXPECTED_AUDIENCE}/`);
  } else {
    expect(params.get("audience") ?? "", "no audience at all").toMatch(/^https:\/\/api\./);
  }

  /*
    THE CALLBACK, which the BACKEND decides and not the browser.

    It comes from ApiOrigins.appOrigin() server side. That is deliberate: the client used to send
    a redirect_uri built from window.location.origin, and removing that made this one value the
    only thing Auth0 is ever asked to honour. So it is NOT the origin this test is running
    against - locally the suite runs against the preview server while the configured app origin is
    the dev server - and asserting equality with baseURL would assert the wrong thing.

    What must be true is that it names /auth/callback on a real origin. A configured origin
    pointing at a port nothing serves is the shape that produces "Callback URL mismatch" against
    an Auth0 application that is perfectly configured, and sends somebody to the dashboard to fix
    something that was never broken. Reachability is checked separately below.
  */
  const redirectUri = params.get("redirect_uri") ?? "";
  expect(redirectUri, "no redirect_uri at all").not.toBe("");
  const callback = new URL(redirectUri);
  expect(callback.pathname).toBe("/auth/callback");
  expect(callback.protocol, "the callback must be http or https").toMatch(/^https?:$/);

  // PKCE, because the password path uses the authorization-code flow precisely so that no
  // password passes through our hands (RFC 9700 section 2.4). No challenge means it is not that
  // flow any more.
  expect(params.get("code_challenge") ?? "", "no PKCE challenge").not.toBe("");
  expect(params.get("code_challenge_method")).toBe("S256");

  expect(params.get("response_type")).toBe("code");
}

test.describe("Every way in reaches Auth0", () => {
  const SOCIAL = [
    { label: "Google",    connection: "google-oauth2" },
    { label: "Microsoft", connection: "windowslive" },
    { label: "Facebook",  connection: "facebook" },
  ];

  for (const { label, connection } of SOCIAL) {
    test(`${label} redirects to Auth0 for ${connection}`, async ({ request }) => {
      const url = await authorizeUrlFor(
        request, `connection=${connection}&returnTo=%2Fsearch`);
      expectSoundAuthorizeUrl(url);
      // The provider has to survive the hop, or the person lands on a generic Auth0 page and has
      // to pick again - or signs in with the wrong identity entirely.
      expect(url.params.get("connection")).toBe(connection);
    });
  }

  test("email and password redirects to Auth0 for the database connection", async ({ request }) => {
    const url = await authorizeUrlFor(
      request, "connection=Username-Password-Authentication&returnTo=%2Fsearch");
    expectSoundAuthorizeUrl(url);
    expect(url.params.get("connection")).toBe("Username-Password-Authentication");
    expect(url.params.get("screen_hint"), "signing in must not open the signup screen").toBeNull();
  });

  test("creating an account redirects to Auth0 asking for the signup screen", async ({ request }) => {
    const url = await authorizeUrlFor(
      request, "connection=Username-Password-Authentication&screen_hint=signup&returnTo=%2F");
    expectSoundAuthorizeUrl(url);
    // Allowlisted to 'signup' server side. Losing it turns "Create an account" into a sign-in
    // page, and nothing on screen would say why.
    expect(url.params.get("screen_hint")).toBe("signup");
  });

  test("the return trip is served: /auth/callback and /api/auth/me both answer", async ({ request, page }) => {
    /*
      Auth0 sends the browser to /auth/callback. If the client does not serve that route, every
      sign-in completes successfully at Auth0 and then dies on the doorstep - which looks like an
      authentication failure and is not one.
    */
    await page.goto("/auth/callback");
    expect(page.url()).toContain("/auth/callback");

    /*
      And the backend half. 401 is the CORRECT answer with no session: what matters is that the
      endpoint is wired and answering at all, which a 500 from the proxy would not be.
    */
    const me = await patientGet(request, "/api/auth/me");
    expect([200, 401], `/api/auth/me answered ${me.status()}`).toContain(me.status());
  });

  test("the callback origin the backend names is actually serving", async ({ request, playwright }) => {
    /*
      The one thing the equality assertion above used to be reaching for, done properly.

      The backend hands Auth0 a single configured callback URL. If that origin is not serving -
      wrong port, server not started, a stale APP_ORIGIN - then every sign-in succeeds at Auth0
      and the browser lands on nothing. From the outside that looks like an authentication
      failure, which is why it is worth a check of its own.
    */
    const { params } = await authorizeUrlFor(
      request, "connection=google-oauth2&returnTo=%2Fsearch");
    const callback = new URL(params.get("redirect_uri")!);

    const probe = await playwright.request.newContext({ baseURL: callback.origin });
    try {
      const res = await probe.get(callback.pathname, { timeout: 30_000 });
      expect(res.status(),
        `the backend tells Auth0 to return to ${callback.href}, which answered ${res.status()}`)
        .toBe(200);
    } finally {
      await probe.dispose();
    }
  });

  test("a signed-out visitor is not quietly treated as signed in", async ({ request }) => {
    // The inverse of the check above, and worth stating: an endpoint that answered 200 with an
    // empty user to an anonymous caller would make every gate in the product meaningless.
    const me = await patientGet(request, "/api/auth/me");
    if (me.status() === 200) {
      const body = await me.json().catch(() => ({}));
      expect(body?.id ?? body?.auth0Id ?? null,
        "an anonymous request came back with a user").toBeNull();
    }
  });
});
