import { test, expect } from "./base";
import { mockAddBossPage, pickLocation } from "./fixtures";
import { scopedDraftKey } from "../client/lib/draftScope";

/*
  THE SAVED DRAFT KEEPS EVERY ANSWER THE FORM ASKED FOR.

  The point of capturing a draft (CLAUDE.md section 44) is that work is never thrown away. A field
  silently dropped from the draft is work thrown away in the one flow built to prevent exactly that,
  and the gap is invisible: the company NAME comes back, so the field looks answered while its id
  and the location are gone.

  RateMyManagers kept neither `workLocation` nor `companyId`; Werkpages kept both. An RMM visitor
  who answered the location, was bounced to sign-in at submit and came back had to answer it again.

  This spec is IDENTICAL in both products on purpose. It is the test that fails when one of them
  drops a field the other keeps, which is the durable fix rather than patching one file.
*/

/*
  The anonymous scope, because this spec fills the form out logged out.

  Drafts are keyed per account now: an unscoped draft was being poured into whoever loaded the
  form next, and tests/draft-isolation.spec.ts is about that. Nothing else in this spec changed -
  it is still the test that fails when one product drops a field the other keeps.
*/
const DRAFT_KEY = scopedDraftKey("rmm_pending_manager", null);

async function fillStep1(page: any) {
  await page.locator('input[name="firstName"]').fill("Jordan");
  await page.locator('input[name="lastName"]').fill("Smith");
  await page.locator('input[name="title"]').fill("Engineering Manager");
  await page.locator('input[name="company"]').fill("Acme Corp");
  await page.keyboard.press("Escape");
  await pickLocation(page);
}

test.describe("saved draft: every answer survives", () => {
  test("the draft carries the location and the company identity", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await fillStep1(page);

    // The draft is written by an effect, so wait for it rather than assuming it is immediate.
    await expect
      .poll(async () => {
        const raw = await page.evaluate((k: string) => localStorage.getItem(k), DRAFT_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      })
      .not.toBeNull();

    const draft = JSON.parse(
      (await page.evaluate((k: string) => localStorage.getItem(k), DRAFT_KEY)) as string,
    );

    // The field this test exists for.
    expect(draft).toHaveProperty("workLocation");
    expect(draft.workLocation).toBeTruthy();
    // Some part of the chosen place must actually be in there: an empty object would satisfy
    // "has the key" while losing the answer, which is the failure mode being guarded.
    const loc = draft.workLocation;
    expect(
      Boolean(loc.country || loc.state || loc.city || loc.text || loc.label),
    ).toBe(true);

    // And the company as an IDENTITY, not just text the server has to interpret again.
    expect(draft).toHaveProperty("companyId");

    // The answers that were already kept, so a fix for one field cannot regress the others.
    expect(draft.formData.firstName).toBe("Jordan");
    expect(draft.formData.lastName).toBe("Smith");
    expect(draft.formData.title).toBe("Engineering Manager");
    expect(draft.formData.company).toBe("Acme Corp");
  });

  test("the location comes back after a reload", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await fillStep1(page);
    await expect
      .poll(async () => await page.evaluate((k: string) => localStorage.getItem(k), DRAFT_KEY))
      .not.toBeNull();

    const before = JSON.parse(
      (await page.evaluate((k: string) => localStorage.getItem(k), DRAFT_KEY)) as string,
    ).workLocation;

    await page.reload();

    // A reload is as much a round trip as a sign-in, and the answer was equally lost either way.
    await expect
      .poll(async () => {
        const raw = await page.evaluate((k: string) => localStorage.getItem(k), DRAFT_KEY);
        return raw ? JSON.parse(raw).workLocation : null;
      })
      .toEqual(before);
  });
});
