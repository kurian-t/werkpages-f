import { test, expect } from "./base";
import { mockAddBossPage, pickLocation } from "./fixtures";

/*
  THE LEGACY ADD-MANAGER JOURNEY, which is still what production serves.

  This is the other half of role-aware-contribution.spec.ts and it lives in its own file because
  the two need different BUNDLES: the flag reaches the client through `import.meta.env`, so it is
  baked in at build time and one bundle cannot be both. playwright.config.ts runs this file under
  the `legacy-form-*` projects, which serve a bundle built with VITE_ROLE_AWARE_SUBMISSION=false
  on :4175.

  It used to be a `test.skip(FLAG_ON)` inside the other file, which meant that the moment the flag
  went on locally this assertion stopped running - exactly when it starts mattering, because from
  then on nobody on the team is looking at the legacy journey by accident.

  What it proves: the new step does not leak into what a visitor gets. The component is bundled
  either way and the flag gates it at runtime, so "the string is absent from the JavaScript" would
  be the wrong assertion. What matters is that the STEP does not render.
*/
test.describe("the shipped build does not show the new step", () => {
  test("step 1 leads straight to the work timeline", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");
    await page.locator('input[name="firstName"]').fill("Priya");
    await page.locator('input[name="lastName"]').fill("Raghunathan");
    await page.locator('input[name="title"]').fill("Dispatch Lead");
    await page.locator('input[name="company"]').fill("Halverson Logistics");
    await page.keyboard.press("Escape");
    await pickLocation(page);
    await page.getByTestId("form-next").click();

    await expect(page.getByText(/select the job you want to rate/i)).toHaveCount(0);
    await expect(page.getByText(/none of these profiles/i)).toHaveCount(0);
    // The legacy second step, which is where the old journey goes.
    await expect(page.getByLabel("From month")).toBeVisible();
  });

  /*
    THE OTHER SIDE OF THE STEP COUNT. Three steps here, and it must stay three: the fix for the
    role-aware header derives the number from the step list rather than hardcoding one, and a
    derivation that got the legacy journey wrong would be no better than the literal it replaced.
  */
  test("the legacy journey still counts three steps", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible();
  });

  /*
    THE MANAGER'S STATUS IS STILL ASKED HERE, and it has to be.

    The role-aware journey stopped asking it on screen one, because whether somebody still holds a
    job is a fact about an employment and that journey asks it of the employment the contributor
    picked. This journey picks no employment and nothing else in it collects the answer, so
    removing the question here would silently file every manager as currently active.
  */
  test("step 1 still asks whether the manager is currently active", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");

    await expect(page.getByText(/manager status/i)).toBeVisible();
    await expect(page.getByText(/currently active/i)).toBeVisible();
    await expect(page.getByText(/retired \/ no longer in this role/i)).toBeVisible();
  });
});
