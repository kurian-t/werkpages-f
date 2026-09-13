import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * The page somebody lands on when their rating is held for verification.
 *
 * A held rating is the most delicate state in the product: the person has already written
 * something, it is saved, and it is not visible. They did not choose to be here. So the page has
 * two jobs before it has any others - say the rating still exists, and say whether there is
 * anything they can do - and it gets both wrong in different ways depending on why the hold
 * happened.
 *
 * Barely any of it ran. The whole page is 305 lines and under 40% of its functions were reached,
 * including every validation message and both no-op states.
 */

const MANAGER_ID = 42;
const URL = `/managers/${MANAGER_ID}/confirm?name=Dana%20Reed&company=Initech`;

/** A challenge the author can answer themselves. The other reasons are decided by a person. */
function challenge(over: Record<string, unknown> = {}) {
  return { id: "ch-1", status: "awaiting_evidence", reason: "high_profile", emailDomain: null, ...over };
}

async function open(page: any, body: unknown = { challenge: challenge() }, url = URL) {
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_USER);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_USER }));
  await page.route(/\/proof-challenge/, (r: any) => r.fulfill({ json: body }));
  await page.goto(url);
}

/** Fills every required answer, leaving the optional ones empty. */
async function fillForm(page: any) {
  await page.getByRole("radio", { name: /They were my direct manager/ }).check();
  await page.getByLabel("Start month").selectOption("03");
  await page.getByLabel("Start year").selectOption({ index: 1 });
  await page.getByLabel("End month").selectOption("11");
  await page.getByLabel("End year").selectOption({ index: 1 });
  await page.getByPlaceholder("Job title").fill("Staff Engineer");
}

test.describe("Arriving at a held rating", () => {
  test("the first thing it says is that the rating still exists", async ({ page }) => {
    /*
      Ahead of the explanation and ahead of the form, because somebody who believes their work was
      deleted does not stay to fill in six fields to get it back. The fear is the thing to answer
      first; the process can wait a paragraph.
    */
    await open(page);

    await expect(page.getByText("Your rating for Dana Reed is saved.")).toBeVisible({ timeout: 10_000 });
  });

  test("it says why this one was held", async ({ page }) => {
    // "We do a quick check on high-profile managers" is a policy. Silence here reads as an
    // accusation about the rating itself.
    await open(page);

    await expect(page.getByText(/high-profile manager/i)).toBeVisible({ timeout: 10_000 });
  });

  test("the person's own name and company are used, not placeholders", async ({ page }) => {
    await open(page);

    await expect(page.getByRole("heading", { name: "Help us verify your rating" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Your rating for Dana Reed is saved.")).toBeVisible();
  });

  test("a link that lost its parameters still reads as a sentence", async ({ page }) => {
    /*
      These arrive by email and get truncated, forwarded, and re-typed. Without a fallback the page
      says "Your rating for is saved", which reads as a bug at the exact moment somebody is deciding
      whether to trust the hold.
    */
    await open(page, { challenge: challenge() }, `/managers/${MANAGER_ID}/confirm`);

    await expect(page.getByText("Your rating for this person is saved.")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("When there is nothing for the author to do", () => {
  test("a hold nobody can self-verify says so instead of asking for evidence", async ({ page }) => {
    /*
      Only a high-profile hold is answerable by its author. A flagged author or a repeated name is
      decided by a person reading it, and showing this form there would collect evidence that
      changes nothing - the worst kind of form, one whose answers are discarded.
    */
    await open(page, { challenge: challenge({ reason: "flagged_author" }) });

    await expect(page.getByRole("heading", { name: "Someone is reviewing this" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/nothing you need to do/i)).toBeVisible();
    await expect(page.getByPlaceholder("Job title")).toHaveCount(0);
  });

  test("a hold already sent for review thanks the person rather than asking twice", async ({ page }) => {
    await open(page, { challenge: challenge({ status: "admin_review" }) });

    await expect(page.getByRole("heading", { name: "Someone is reviewing this" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/a person on our team is reading what you sent/i)).toBeVisible();
  });

  test("both no-op states still promise the rating is saved", async ({ page }) => {
    // The reassurance is the part that has to survive every branch. It is the only sentence on the
    // page that is true regardless of what happens next.
    await open(page, { challenge: challenge({ reason: "flagged_author" }) });

    await expect(page.getByText(/your rating of Dana Reed stays saved/i)).toBeVisible({ timeout: 10_000 });
  });

  test("no outstanding challenge is a dead end with a way out", async ({ page }) => {
    // Reached by following an old link after the hold was decided. An empty form here would ask
    // somebody to prove something nobody is asking about any more.
    await open(page, { challenge: null });

    await expect(page.getByRole("heading", { name: "Nothing to confirm" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();
  });
});

test.describe("Answering the challenge", () => {
  test("each unanswered question says what it wants, in its own words", async ({ page }) => {
    /*
      The message repeats the field's own question rather than saying "required", so there is
      nothing to map from the error back to the box. Three separate messages, because a single
      banner on a six-field form does not say which fields.
    */
    await open(page);
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(page.getByText("Add when you started working together")).toBeVisible();
    await expect(page.getByText("Add the role you held at the time")).toBeVisible();
    await expect(page.getByText("Pick the option that fits best")).toBeVisible();
  });

  test("the end date is only asked for once the start is given", async ({ page }) => {
    /*
      Both dates report through the one field, so only one message can be on screen and it has to
      be the one that is actually missing. Written as two unguarded assignments the second always
      won, and an empty form asked for the end date while never mentioning the start - the field
      the reader had not filled in either.
    */
    await open(page);
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Start month").selectOption("03");
    await page.getByLabel("Start year").selectOption({ index: 1 });

    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(page.getByText("Add when you stopped working together")).toBeVisible();
    await expect(page.getByText("Add when you started working together")).toHaveCount(0);
  });

  test("nothing is sent while an answer is missing", async ({ page }) => {
    let sent = false;
    await open(page);
    await page.route(/\/evidence$/, (r: any) => { sent = true; return r.fulfill({ status: 200, json: {} }); });
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(page.getByText("Pick the option that fits best")).toBeVisible();
    expect(sent).toBe(false);
  });

  test("answering a question clears its complaint", async ({ page }) => {
    // Cleared on change rather than on the next submit, so the page stops accusing somebody of
    // something they have just fixed.
    await open(page);
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Submit for verification" }).click();
    await expect(page.getByText("Pick the option that fits best")).toBeVisible();

    await page.getByRole("radio", { name: /They were my direct manager/ }).check();

    await expect(page.getByText("Pick the option that fits best")).toHaveCount(0);
  });

  test("still being there replaces the end date rather than needing one", async ({ page }) => {
    // An open-ended overlap is a real answer, and demanding an end date would have somebody invent
    // one on a form whose whole purpose is checking that their account is accurate.
    await open(page);
    await expect(page.getByLabel("End month")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("checkbox", { name: /I still work there/ }).check();

    await expect(page.getByLabel("End month")).toHaveCount(0);
  });

  test("a complete answer is sent with the optional fields as null, not as empty strings", async ({ page }) => {
    /*
      Null and "" are different claims about an optional answer - one says nothing was given, the
      other says an empty answer was. An admin reading these has to be able to tell.
    */
    let sent: any = null;
    await open(page);
    await page.route(/\/evidence$/, (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });

    await fillForm(page);
    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(async () => expect(sent).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(sent.relationship).toBe("direct_report");
    expect(sent.claimedTitle).toBe("Staff Engineer");
    expect(sent.claimedOrg).toBeNull();
    expect(sent.evidenceNote).toBeNull();
  });

  test("an open-ended overlap is sent with no end date", async ({ page }) => {
    let sent: any = null;
    await open(page);
    await page.route(/\/evidence$/, (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("radio", { name: /They were my direct manager/ }).check();
    await page.getByLabel("Start month").selectOption("03");
    await page.getByLabel("Start year").selectOption({ index: 1 });
    await page.getByRole("checkbox", { name: /I still work there/ }).check();
    await page.getByPlaceholder("Job title").fill("Staff Engineer");
    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(async () => expect(sent).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(sent.workedUntil).toBeNull();
  });

  test("the optional answers are sent when they are given", async ({ page }) => {
    let sent: any = null;
    await open(page);
    await page.route(/\/evidence$/, (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });

    await fillForm(page);
    await page.getByPlaceholder("Team, department, or organization").fill("Platform");
    await page.getByPlaceholder(/where you worked together/).fill("We overlapped on the billing rewrite.");
    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(async () => expect(sent).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(sent.claimedOrg).toBe("Platform");
    expect(sent.evidenceNote).toContain("billing rewrite");
  });

  test("a refusal is repeated as the server worded it", async ({ page }) => {
    // The server is the only side that knows why - a challenge already answered, a window closed.
    // Replacing that with a generic message leaves somebody retrying something that cannot work.
    await open(page);
    await page.route(/\/evidence$/, (r: any) =>
      r.fulfill({ status: 409, json: { message: "This challenge has already been answered." } }));
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });

    await fillForm(page);
    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(page.getByRole("alert")).toHaveText("This challenge has already been answered.", { timeout: 10_000 });
  });

  test("a failure with nothing to say still says something", async ({ page }) => {
    await open(page);
    await page.route(/\/evidence$/, (r: any) => r.abort("failed"));
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });

    await fillForm(page);
    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(page.getByRole("alert")).toHaveText(/Something went wrong/, { timeout: 10_000 });
  });

  test("the submit is shut while it is in flight", async ({ page }) => {
    // Two submissions of the same evidence give an admin the same account twice and no way to know
    // it was one person pressing twice.
    await open(page);
    await page.route(/\/evidence$/, async (r: any) => {
      await new Promise((res) => setTimeout(res, 1200));
      return r.fulfill({ status: 200, json: { success: true } });
    });
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible({ timeout: 10_000 });

    await fillForm(page);
    await page.getByRole("button", { name: "Submit for verification" }).click();

    await expect(page.getByRole("button", { name: "Sending..." })).toBeDisabled();
  });

  test("the answers are promised never to be published", async ({ page }) => {
    /*
      The page asks for a real job title, real dates and a real reporting line - identifying
      details, about a rating whose entire value is that it is anonymous. Saying where that goes is
      not decoration.
    */
    await open(page);

    await expect(page.getByText("This information is never published.")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("The work-email route", () => {
  test("it is offered only when there is a domain to check against", async ({ page }) => {
    await open(page, { challenge: challenge({ emailDomain: "initech.com" }) });

    await expect(page.getByText("Confirm you worked at Initech")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("@initech.com")).toBeVisible();
  });

  test("without a domain the section is absent, not disabled", async ({ page }) => {
    // A dead control that never explains itself is worse than no control. There is nothing to send
    // a code to, so there is nothing to show.
    await open(page);

    await expect(page.getByText(/Confirm you worked at/)).toHaveCount(0);
  });
});
