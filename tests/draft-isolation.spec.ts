/* ROUTINE CI: security: one account's draft must never publish under another. Tagged @ci; see playwright.config.ts. */
import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_USER,
  mockAddBossPage,
  mockManagerPage,
  pickLocation,
  openAndCompleteReview,
} from "./fixtures";

/*
  ONE PERSON'S UNFINISHED CONTRIBUTION MUST NEVER APPEAR IN ANOTHER PERSON'S FORM.

  ── What is wrong ──────────────────────────────────────────────────────────────

  The add-manager form and the rate-a-manager form keep their draft in localStorage under a key
  with no account in it, and restore it on mount without asking whose it is:

      localStorage.getItem("rmm_pending_manager")     // AddBoss
      localStorage.getItem("rmm_pending_review")      // BossProfile

  So on any browser used by more than one person - a shared laptop, a library machine, a partner's
  computer - whoever loads the form next is shown the answers the last person left behind. The
  restored draft carries the ratings, the dates, the company, WHO the rating is about, the
  server-side draft and capture tokens, and the email address typed into the sign-up step.

  The product already knows this is wrong. `useFormDraft` scopes every draft by account and only
  ever OFFERS an anonymous one, and its own comment says why: a second account signing in was
  shown the first account's unfinished rating, "which, once a signed-in contributor also saves to
  the server, is how one person's words would be published under another's name." That fix was
  never applied to the two forms that matter most.

  ── Why it is being fixed now ──────────────────────────────────────────────────

  Today it is rare. `AuthFlowModal` signs in over XHR, in place, so the page does not remount and
  the restore effect does not run after a sign-in. Stage 4 replaces that with Universal Login,
  where every sign-in is a full-page navigation, so the restore runs EVERY time somebody comes
  back from authenticating. A rare contamination becomes the ordinary path.

  ── Why these tests drive the real form ────────────────────────────────────────

  Only the email-disclosure case seeds storage directly. The rest fill the form, let the
  application write its draft wherever it writes it, and then arrive as somebody else. That way
  the tests know nothing about the storage layout, so they fail against the vulnerable build and
  pass against the fixed one for the same reason rather than because a key was renamed.

  ── The invariant ──────────────────────────────────────────────────────────────

  A draft is shown to the person who wrote it, and to nobody else. An anonymous draft reaching an
  authenticated form is OFFERED, never applied, because the browser cannot tell "the person who
  just signed in" from "the next person at this machine".
*/

/** A second, distinct account. The id is what the scope is keyed on, so it must differ. */
const SECOND_PERSON = {
  ...MOCK_USER,
  id: "second-person-2",
  username: "secondperson",
  firstName: "Second",
  lastName: "Person",
  email: "second@example.com",
};

const FULL_RATINGS = {
  "Communication Style": 4, "Perceived Approachability": 4,
  "Perceived Clarity of Expectations": 4, "Feedback Style": 4,
  "Perceived Supportiveness": 4, "Decision Making Style": 4,
  "Organization and Planning Style": 4, "Delegation Style": 4,
  "Perceived Professional Demeanor": 4, "Overall Working Experience": 4,
};

async function fillManagerStep1(page: any, firstName = "Jordan") {
  await page.locator('input[name="firstName"]').fill(firstName);
  await page.locator('input[name="lastName"]').fill("Smith");
  await page.locator('input[name="title"]').fill("Engineering Manager");
  await page.locator('input[name="company"]').fill("Acme Corp");
  await page.keyboard.press("Escape");
  await pickLocation(page);
}

/**
 * Whether an answer is anywhere in the form: rendered as text, or sitting in a field.
 *
 * <p>Both halves are necessary and that was learned here. A restored draft collapses the step it
 * has answered into a summary line, so some answers are page TEXT; the ones whose step is still
 * open are input VALUES, which `getByText` cannot see. An assertion on only one of the two passes
 * while the other person's answers are plainly on screen, which is how the first version of this
 * spec reported one contaminated form as clean.
 */
async function formCarries(page: any, needle: string): Promise<boolean> {
  return page.evaluate((n: string) => {
    if ((document.body.innerText || "").includes(n)) return true;
    for (const el of Array.from(document.querySelectorAll("input, textarea"))) {
      const value = (el as HTMLInputElement).value;
      if (value && value.includes(n)) return true;
    }
    return false;
  }, needle);
}

/**
 * Waits until the stored draft actually holds a given answer.
 *
 * <p>Stronger than waiting for the key to exist, and the difference showed up as flake: the save
 * effect runs on every change, so the draft can exist holding only the first field while the rest
 * of the step is still being typed. A test that moves on at that point either switches accounts
 * with half a draft written, which weakens it, or reloads before the answer it is about was ever
 * saved, which fails it. Seen once on firefox under a full parallel suite and not when run alone,
 * which is exactly how a race presents.
 */
async function waitForDraftHolding(page: any, base: string, needle: string) {
  await expect
    .poll(async () => JSON.stringify(await anyStoredDraft(page, base)).includes(needle),
          { timeout: 15_000 })
    .toBe(true);
}

/**
 * Waits until the form has mounted AND its restore decision has had time to render.
 *
 * <p>Needed because every assertion here is an ABSENCE, and an absence is true of a page that has
 * not finished rendering yet. `page.goto` resolves on load; the draft is restored by a mount
 * effect, so a check made immediately afterwards sees an empty form, passes, and the previous
 * person's answers appear a moment later.
 *
 * <p>That is not hypothetical. The first version of this spec passed on the signed-in case for
 * exactly that reason, and then failed on a later run with nothing changed, while a debug dump of
 * the same page showed "Step 1 of 4 - Priya Smith" and every one of her answers in it. A test that
 * reports a contaminated form as clean is worse than no test. The fixed delay is deliberate rather
 * than lazy: when the correct outcome is that NOTHING happens, there is no positive signal to wait
 * for.
 */
async function waitForTheFormToSettle(page: any) {
  await expect(page.getByText("Manager information").first()).toBeVisible();
  await page.waitForTimeout(1200);
}

/** Whatever the application stored, under any key, for either form. */
async function anyStoredDraft(page: any, base: string) {
  return page.evaluate((b: string) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(localStorage)) {
      if (key === b || key.startsWith(`${b}::`)) {
        try { out[key] = JSON.parse(localStorage.getItem(key) as string); }
        catch { out[key] = localStorage.getItem(key); }
      }
    }
    return out;
  }, base);
}

test.describe("draft isolation: a draft belongs to one person @ci", () => {

  test("an anonymous draft is not poured into the next person's form", async ({ page }) => {
    /*
      THE CORE CASE, and the one that is about attribution rather than only privacy.

      Somebody fills in the add-manager form without an account and walks away. The next person
      at this browser signs in and opens the same form. They must not find the first person's
      answers sitting in it, because the next thing that form does is publish them, under THEIR
      name.
    */
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await fillManagerStep1(page, "Jordan");

    // The draft is written by an effect. Wait for the application to have stored something,
    // rather than assuming when.
    await waitForDraftHolding(page, "rmm_pending_manager", "Engineering Manager");

    // A different person signs in on this browser. Registered after the first set, so these win.
    await mockAddBossPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.goto("/add");
    await waitForTheFormToSettle(page);

    /*
      Asserted as ABSENCE FROM THE PAGE rather than as an empty input, because a restored draft
      collapses the step it has answered into a summary line - so the inputs are not even
      rendered, and `toHaveValue("")` would fail with "element not found" and say nothing about
      the defect. What must hold is that none of the previous person's answers are on this page,
      in a field or anywhere else.
    */
    for (const answer of ["Jordan", "Smith", "Engineering Manager", "Acme Corp"]) {
      expect(await formCarries(page, answer),
        `the previous person's answer "${answer}" is in this person's form`).toBe(false);
    }
  });

  test("a draft written while signed in is not shown to a different account", async ({ page }) => {
    /*
      The same failure without an anonymous step in it. One account types, signs out or simply
      leaves, and a second account on the same browser opens the form.

      This is the case scoped storage closes outright: there is no judgement to make about who
      wrote it, because the draft says.
    */
    await mockAddBossPage(page, { loggedIn: true, user: MOCK_USER });
    await page.goto("/add");
    await fillManagerStep1(page, "Priya");

    await waitForDraftHolding(page, "rmm_pending_manager", "Engineering Manager");

    await mockAddBossPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.goto("/add");
    await waitForTheFormToSettle(page);

    for (const answer of ["Priya", "Engineering Manager"]) {
      expect(await formCarries(page, answer),
        `another account's answer "${answer}" is in this person's form`).toBe(false);
    }
  });

  test("somebody else's email address is never rendered from a draft", async ({ page }) => {
    /*
      THE DISCLOSURE, which is separate from the attribution problem and is worse.

      The draft carries `signupEmail`, the address typed into the sign-up step, and the restore
      feeds it to `setPendingVerificationEmail` and opens the auth modal on its `verify_email`
      step - which renders the address: "We sent a verification link to <address>".

      So on a shared browser the form shows one visitor the private email address of the last
      one. On a product whose whole promise is anonymous workplace feedback, that is the most
      damaging thing in this file.

      This is the one case that seeds storage, because the address only enters a draft after a
      real sign-up attempt. It is written at BOTH the legacy key and the account-scoped anonymous
      key, so the assertion is about what the form DISPLAYS whichever key the build reads.
    */
    const SOMEBODY_ELSE = "someone.private@example.invalid";
    await mockAddBossPage(page, { loggedIn: false });
    await page.addInitScript((email: string) => {
      const draft = JSON.stringify({
        returnTo: "/add",
        formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "", state: "", linkedinUrl: "", status: "active" },
        signupEmail: email,
        emailVerified: false,
        savedAt: Date.now(),
      });
      localStorage.setItem("rmm_pending_manager", draft);
      localStorage.setItem("rmm_pending_manager::anon", draft);
    }, SOMEBODY_ELSE);

    await page.goto("/add");

    // Give the restore effect and any modal it opens a chance to render before concluding.
    await waitForTheFormToSettle(page);
    expect(await formCarries(page, SOMEBODY_ELSE),
      "another visitor's private email address is on screen").toBe(false);
    expect(await page.content()).not.toContain(SOMEBODY_ELSE);
  });

  test("a review draft left by somebody else is never submitted as the person who signs in",
    async ({ page }) => {
    /*
      THE WORST OUTCOME IN THE PRODUCT, and it is automatic rather than merely possible.

      BossProfile's restore effect ends with:

          } else if (user) {
              const allRated = ... every rating >= 1 ...
              if (allRated) { setReviewStep("ratings"); setPendingAutoSubmit(user); }

      A complete review draft plus ANY signed-in user means the review is submitted for that
      user. Nothing checks that the draft is theirs. So: somebody rates a manager on a shared
      computer and leaves before signing in; the next person signs in for their own reasons; the
      first person's ten ratings are published under the second person's account.

      One person's words, published under another's name, with neither of them doing anything
      wrong. Asserting on the POST is the point: a test that only checked the form's contents
      would pass while the submission went out.
    */
    let reviewPosts = 0;
    await mockManagerPage(page, { loggedIn: false });

    await page.addInitScript((payload: string) => {
      localStorage.setItem("rmm_pending_review", payload);
      localStorage.setItem("rmm_pending_review::anon", payload);
    }, JSON.stringify({
      returnTo: `/manager/${TEST_MANAGER_ID}`,
      managerId: TEST_MANAGER_ID,
      modalRatings: FULL_RATINGS,
      authorType: "anonymous",
      generatedName: "CoolLynx30",
      reviewAttested: true,
      reviewWorkedFrom: { month: "01", year: "2021" },
      reviewWorkedUntil: { month: "12", year: "2022" },
      reviewCurrentlyWorking: false,
      reviewManagerCompany: "Acme Corp",
      reviewManagerTitle: "Engineering Manager",
      savedAt: Date.now(),
    }));

    // Somebody who had nothing to do with that draft signs in on this browser.
    await mockManagerPage(page, { loggedIn: true, user: SECOND_PERSON });

    /*
      Registered AFTER the page mocks, deliberately. Playwright matches routes in reverse
      registration order, and `mockManagerPage` answers this exact POST itself - so a counter
      registered before it never sees the request, the count stays zero, and the test passes
      while the submission goes out. That false pass happened on the first run of this spec.
    */
    await page.route(/\/api\/managers\/[^/]+\/reviews$/, (route) => {
      if (route.request().method() === "POST") {
        reviewPosts += 1;
        route.fulfill({ status: 201, json: { id: "r-1" } });
      } else {
        route.fulfill({ json: { data: [] } });
      }
    });

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible();

    // Long enough for the auto-submit path to have fired if it was going to.
    await page.waitForTimeout(2500);
    expect(reviewPosts,
      "a review draft that this account did not write was submitted under their name").toBe(0);
  });

  test("the person's own draft still comes back to them", async ({ page }) => {
    /*
      The guard on the fix rather than on the defect. Isolating drafts is easy to over-apply:
      scoping them and then failing to restore the owner's own would throw away exactly the work
      all of this exists to protect.
    */
    await mockAddBossPage(page, { loggedIn: true, user: MOCK_USER });
    await page.goto("/add");
    await fillManagerStep1(page, "Jordan");

    await waitForDraftHolding(page, "rmm_pending_manager", "Engineering Manager");

    await page.goto("/add");
    /*
      Asserted as text or field value rather than as a specific control: a restored draft collapses
      the step it has answered into a summary line, so the input is not on the page. What matters
      is that the answers came back, not which control is holding them.
    */
    await expect.poll(async () => formCarries(page, "Jordan"), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => formCarries(page, "Engineering Manager"), { timeout: 15_000 })
      .toBe(true);
  });

  test("an anonymous draft is offered to the person who signs in, not applied", async ({ page }) => {
    /*
      The legitimate case, and the reason this is an offer rather than a refusal.

      Filling the form in and signing in at submit is the designed path (CLAUDE.md section 44), so
      the answers have to be reachable afterwards. They are just not applied silently, because the
      browser cannot tell that person from the next one at the same machine. The form says it has
      something and they say whether it is theirs.
    */
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await fillManagerStep1(page, "Jordan");

    await waitForDraftHolding(page, "rmm_pending_manager", "Engineering Manager");

    await mockAddBossPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.goto("/add");
    await waitForTheFormToSettle(page);

    // Nothing applied...
    expect(await formCarries(page, "Jordan")).toBe(false);
    // ...and not thrown away either: the form says it is holding something.
    const offer = page.getByRole("button", { name: /restore/i });
    await expect(offer).toBeVisible();

    await offer.click();
    await expect.poll(async () => formCarries(page, "Jordan"), { timeout: 15_000 }).toBe(true);
  });
});

/*
  WHAT COUNTS AS PROOF, which is a different question from whether a draft is applied.

  The first round of this fix stopped an anonymous draft being applied silently, with two stated
  exceptions where the draft was treated as proving it belonged to the person now signed in:

      * it carried a `signupEmail` equal to the signed-in account's address;
      * or the page was loaded with `?verified=true`.

  Both are wrong, and the second is badly wrong.

  `signupEmail` lives in localStorage. Anyone who can reach that browser can write it, including
  the person who left the draft, who may know which address the next person signs in with. And
  `?verified=true` is a URL parameter: anybody can type it. Either one re-opened the whole defect,
  because a draft treated as proven is also treated as safe to AUTO-SUBMIT.

  Possession of browser storage is not proof of account ownership, and neither is a query string.
  An anonymous draft has no identity on it to verify, so there is nothing to prove: it is offered,
  always, and nothing is ever published from it without somebody pressing submit.
*/
test.describe("draft ownership: browser storage is not proof @ci", () => {

  test("a draft naming the signed-in person's own email is still only offered", async ({ page }) => {
    /*
      THE TAMPERING CASE.

      Somebody fills the form in on a shared machine and sets `signupEmail` to the address they
      know the next person uses. Under the email-match exception that draft was silently applied to
      that person's form, and on the review page it was auto-submitted under their name.

      Nothing about the match is evidence: it says whoever wrote the draft knew an address, not
      that they own it.
    */
    await mockAddBossPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.addInitScript(([key, email]: [string, string]) => {
      localStorage.setItem(key, JSON.stringify({
        returnTo: "/add",
        formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "", state: "", linkedinUrl: "", status: "active" },
        signupEmail: email,
        savedAt: Date.now(),
      }));
    }, ["rmm_pending_manager::anon", SECOND_PERSON.email]);

    await page.goto("/add");
    await waitForTheFormToSettle(page);

    for (const answer of ["Jordan", "Engineering Manager", "Acme Corp"]) {
      expect(await formCarries(page, answer),
        `a draft claiming this account's email was applied without being offered: "${answer}"`)
        .toBe(false);
    }
    await expect(page.getByRole("button", { name: /^restore$/i })).toBeVisible();
  });

  test("a URL parameter does not restore an anonymous draft", async ({ page }) => {
    /*
      `?verified=true` meant "they followed the link in the verification email", which is a
      reasonable thing to believe and impossible to check: it is typed into the address bar. Under
      that exception, arriving signed in at /add?verified=true applied whatever anonymous draft was
      on the machine - no tampering, no knowledge of anybody's email, just a URL.
    */
    await mockAddBossPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, JSON.stringify({
        returnTo: "/add",
        formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "", state: "", linkedinUrl: "", status: "active" },
        savedAt: Date.now(),
      }));
    }, "rmm_pending_manager::anon");

    await page.goto("/add?verified=true");
    await waitForTheFormToSettle(page);

    for (const answer of ["Jordan", "Engineering Manager", "Acme Corp"]) {
      expect(await formCarries(page, answer),
        `a query parameter was accepted as proof and applied "${answer}"`).toBe(false);
    }
  });

  test("accepting an offer does not reveal the email address on it", async ({ page }) => {
    /*
      The offer is accepted by whoever is looking at it, which on a shared browser may not be the
      person who wrote the draft. So the answers come back and the ADDRESS does not: it is the one
      field on a draft that identifies a person outside this product.
    */
    const SOMEBODY_ELSE = "someone.private@example.invalid";
    await mockAddBossPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.addInitScript(([key, email]: [string, string]) => {
      localStorage.setItem(key, JSON.stringify({
        returnTo: "/add",
        formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "", state: "", linkedinUrl: "", status: "active" },
        signupEmail: email,
        savedAt: Date.now(),
      }));
    }, ["rmm_pending_manager::anon", SOMEBODY_ELSE]);

    await page.goto("/add");
    await waitForTheFormToSettle(page);
    await page.getByRole("button", { name: /^restore$/i }).click();

    await expect.poll(async () => formCarries(page, "Jordan"), { timeout: 15_000 }).toBe(true);
    expect(await formCarries(page, SOMEBODY_ELSE),
      "the address from somebody else's draft is on screen after accepting it").toBe(false);
    expect(await page.content()).not.toContain(SOMEBODY_ELSE);
  });

  test("a tampered review draft is neither adopted nor allowed to fake a verification prompt",
    async ({ page }) => {
    /*
      THE SAME TAMPERING, ON THE REVIEW FORM, AND WHAT IT ACTUALLY DID.

      Not an auto-submit. Checked by running it: the restore's branch order means a draft carrying
      `signupEmail` always lands in the "check your email" branch and never reaches the auto-submit
      one, so the ownership gate added in the first round still held. Worth stating plainly rather
      than claiming a worse defect than there was.

      What it DID do, both of which are defects:

        * the draft was silently ADOPTED, so one person's ten ratings, dates and employer moved
          into another account's scope and into their form;
        * and the page told that person "We sent a verification link to <their own address>", a
          prompt fabricated entirely from a value in localStorage, while they were already signed
          in. A product that can be made to say "check your email" by whoever used the browser last
          is a phishing primitive, not merely a confusing screen.
    */
    let reviewPosts = 0;
    await mockManagerPage(page, { loggedIn: false });
    await page.addInitScript(([key, payload]: [string, string]) => {
      localStorage.setItem(key, payload);
    }, ["rmm_pending_review::anon", JSON.stringify({
      returnTo: `/manager/${TEST_MANAGER_ID}`,
      managerId: TEST_MANAGER_ID,
      modalRatings: FULL_RATINGS,
      authorType: "anonymous",
      generatedName: "CoolLynx30",
      reviewAttested: true,
      reviewWorkedFrom: { month: "01", year: "2021" },
      reviewWorkedUntil: { month: "12", year: "2022" },
      reviewCurrentlyWorking: false,
      // Deliberately NOT the manager's own company, which is on this page anyway: the assertion
      // below has to be about a value only the DRAFT carries. The first version of this test used
      // "Acme Corp" and failed against the fixed build for that reason.
      reviewManagerCompany: "Halverson Logistics",
      reviewManagerTitle: "Dispatch Lead",
      signupEmail: SECOND_PERSON.email,
      savedAt: Date.now(),
    })]);

    await mockManagerPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.route(/\/api\/managers\/[^/]+\/reviews$/, (route) => {
      if (route.request().method() === "POST") {
        reviewPosts += 1;
        route.fulfill({ status: 201, json: { id: "r-1" } });
      } else {
        route.fulfill({ json: { data: [] } });
      }
    });

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible();
    await page.waitForTimeout(2500);

    // Not adopted: the anonymous draft is still where it was, waiting to be offered.
    expect(await page.evaluate(() => localStorage.getItem("rmm_pending_review::anon")),
      "a draft claiming this account's email was moved into their scope without being offered")
      .not.toBeNull();

    // No answers from it on the page.
    expect(await formCarries(page, "Halverson Logistics"),
      "another person's answers were applied to this account's form").toBe(false);

    // And no fabricated verification prompt driven by what was in storage.
    expect(await formCarries(page, "We sent a verification link"),
      "localStorage was allowed to make the product tell a signed-in person to check their email")
      .toBe(false);

    // The thing that must never happen, asserted even though the gate already held.
    expect(reviewPosts, "a review was published under an account that did not write it").toBe(0);
  });
});

/*
  WHAT AN UNVERIFIED PERSON SEES, AND WHAT HAPPENS TO THEIR WORK.

  The callback now refuses an identity whose address is not verified. That refusal lands on
  somebody who has done nothing wrong and may be halfway through a rating, so two things have to
  hold: they are told what to do, and their answers are still there afterwards.

  A security control that silently costs people their work is a control that gets removed.
*/
test.describe("the email_unverified refusal is recoverable @ci", () => {

  test("it says what to do, offers a way back, and keeps the unfinished rating",
    async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });

    // Half a rating, written by this person before they were sent off to authenticate.
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, JSON.stringify({
        returnTo: "/add",
        formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "", state: "", linkedinUrl: "", status: "active" },
        savedAt: Date.now(),
      }));
    }, "rmm_pending_manager::anon");

    // The backend refuses: the address on this identity has not been verified.
    await page.route("**/api/auth/callback", (route) =>
      route.fulfill({
        status: 401,
        json: {
          error: "email_unverified",
          message: "Please verify your email address, then sign in again.",
        },
      }));

    await page.goto("/auth/callback?code=the-code&state=the-state");

    // Told what to do, in words about their email rather than a generic failure.
    await expect(page.getByText(/verify your email/i)).toBeVisible({ timeout: 10_000 });
    // And a way onwards, rather than a dead end or a redirect loop.
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    // THE PART THAT MATTERS MOST: their work is untouched by the refusal.
    expect(await page.evaluate(() => localStorage.getItem("rmm_pending_manager::anon")),
      "a refused sign-in must not take the rating with it").not.toBeNull();

    // And it comes back when they return to the form.
    await page.goto("/add");
    await expect.poll(async () => formCarries(page, "Jordan"), { timeout: 15_000 }).toBe(true);
    /*
      POLLED FOR ITS OWN VALUE, rather than asserted once off the back of the poll above.

      The two fields do not necessarily arrive together, so the poll on the name does not
      establish that the title is already there. A bare assertion here passed on chromium and
      failed on firefox in the same loaded run, and passed three times out of three on firefox
      alone - a load race, with nothing wrong with the draft or the restore.

      The assertion is unchanged: the title still has to come back. Only the waiting is added, and
      it is the form this file already uses for the same check elsewhere.
    */
    await expect.poll(async () => formCarries(page, "Engineering Manager"), { timeout: 15_000 })
      .toBe(true);
  });
});

/*
  AN EXPIRED DRAFT IS INERT.

  The TTL is the only thing that ever ends a draft's life, so what happens at the boundary is a
  security property rather than housekeeping: an expired draft that could still be applied, or
  still be auto-submitted, would be a stale draft published under whoever happened to be signed in
  when it resurfaced.
*/
test.describe("an expired draft cannot resurface @ci", () => {

  test("a draft that is nearly a day old still comes back", async ({ page }) => {
    /*
      The TTL moved from twelve hours to twenty-four, because somebody who starts a rating in the
      evening and finishes verifying their email the next afternoon was losing a complete rating to
      our own flow. Asserted so the window cannot be quietly shortened again.
    */
    await mockAddBossPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.addInitScript(([key, payload]: [string, string]) => {
      localStorage.setItem(key, payload);
    }, [`rmm_pending_manager::${SECOND_PERSON.id}`, JSON.stringify({
      returnTo: "/add",
      formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "", state: "", linkedinUrl: "", status: "active" },
      savedAt: Date.now() - 23 * 60 * 60 * 1000,
    })]);

    await page.goto("/add");
    await expect.poll(async () => formCarries(page, "Jordan"), { timeout: 15_000 }).toBe(true);
  });

  test("an expired anonymous review draft is neither offered nor submitted", async ({ page }) => {
    let reviewPosts = 0;
    await mockManagerPage(page, { loggedIn: false });
    await page.addInitScript(([key, payload]: [string, string]) => {
      localStorage.setItem(key, payload);
    }, ["rmm_pending_review::anon", JSON.stringify({
      returnTo: `/manager/${TEST_MANAGER_ID}`,
      managerId: TEST_MANAGER_ID,
      modalRatings: FULL_RATINGS,
      authorType: "anonymous",
      generatedName: "CoolLynx30",
      reviewAttested: true,
      reviewWorkedFrom: { month: "01", year: "2021" },
      reviewWorkedUntil: { month: "12", year: "2022" },
      reviewCurrentlyWorking: false,
      reviewManagerCompany: "Halverson Logistics",
      reviewManagerTitle: "Dispatch Lead",
      savedAt: Date.now() - 25 * 60 * 60 * 1000,   // 25 hours, past the 24-hour TTL
    })]);

    await mockManagerPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.route(/\/api\/managers\/[^/]+\/reviews$/, (route) => {
      if (route.request().method() === "POST") {
        reviewPosts += 1;
        route.fulfill({ status: 201, json: { id: "r-1" } });
      } else {
        route.fulfill({ json: { data: [] } });
      }
    });

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible();
    await page.waitForTimeout(2500);

    expect(reviewPosts, "an expired draft must never be submitted").toBe(0);
    expect(await formCarries(page, "Halverson Logistics"),
      "an expired draft must not be applied").toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("rmm_pending_review::anon")),
      "an expired draft is removed rather than left to be examined on every load").toBeNull();

    /*
      AND THE PERSON IS TOLD. A form that opens empty is indistinguishable from one that threw the
      answers away, so "it expired" is the one thing that explains it. The message names nothing
      from the draft, because whoever reads it may not be whoever wrote it.
    */
    await expect(page.getByText(/expired and could not be restored/i)).toBeVisible();
    expect(await formCarries(page, "CoolLynx30"),
      "the notice must not disclose anything from the draft").toBe(false);
  });

  test("an expired draft in the account's own scope is discarded too", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true, user: SECOND_PERSON });
    await page.addInitScript(([key, payload]: [string, string]) => {
      localStorage.setItem(key, payload);
    }, [`rmm_pending_manager::${SECOND_PERSON.id}`, JSON.stringify({
      returnTo: "/add",
      formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "", state: "", linkedinUrl: "", status: "active" },
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
    })]);

    await page.goto("/add");
    await waitForTheFormToSettle(page);

    expect(await formCarries(page, "Jordan"),
      "an expired draft must not be restored, even to its owner").toBe(false);
    await expect(page.getByText(/a saved draft expired/i)).toBeVisible();
  });
});
