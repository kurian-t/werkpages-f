import { test, expect } from "./base";
import {
  MOCK_ADMIN_USER,
  TEST_MANAGER_ID,
  mockManagerPage,
} from "./fixtures";

/**
 * The inline held-ratings section on a manager's profile, for an admin.
 *
 * ## Why it is here and not only in the admin queue
 *
 * The queue lists every held rating in the product. What releases one is almost always something
 * on the manager: accepting an employment, correcting a role, merging two of them. A moderator
 * working from the queue alone has to carry a review id between two screens, and acting on the
 * wrong rating is a published rating that nobody chose to publish.
 *
 * ## What these tests pin down
 *
 * The backend decides publishability - `rating_role_is_publishable` is the only authority - and
 * the page must not second-guess it. So the assertions are about faithfulness rather than logic:
 * the server's own `whyHeld` and `actionToRelease` wording is shown verbatim, the button is live
 * exactly when the server said `wouldPublishNow`, a refusal shows the server's reason rather than
 * a generic failure, and an ordinary visitor sees none of it.
 */

const URL = `/manager/${TEST_MANAGER_ID}`;

const READY = {
  reviewId: "11111111-1111-1111-1111-111111111111",
  submittedAt: "2026-10-01T00:00:00Z",
  managerId: TEST_MANAGER_ID,
  managerName: "Test Manager",
  title: "Depot Supervisor",
  company: "Acme Logistics",
  overallRating: 4.5,
  claimId: 10,
  roleId: 20,
  roleState: "accepted",
  whyHeld: "Nothing is blocking it any more.",
  actionToRelease: "It can be published now.",
  wouldPublishNow: true,
};

const BLOCKED = {
  ...READY,
  reviewId: "22222222-2222-2222-2222-222222222222",
  roleState: "proposed",
  whyHeld: "The employment it names is proposed.",
  actionToRelease: "Accept the employment.",
  wouldPublishNow: false,
};

async function openAsAdmin(page: any, held: any[], publish?: (route: any) => any) {
  await page.route(/\/api\/admin\/moderation\/held-ratings\?[^/]*$/, (route: any) =>
    route.fulfill({ json: { data: held } }),
  );
  if (publish) {
    await page.route(/\/api\/admin\/moderation\/held-ratings\/[^/]+\/publish/, publish);
  }
  await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER, hasContributed: true });
  await page.goto(URL);
}

test.describe("Held ratings, inline on the profile", () => {
  test("an admin sees each held rating with the server's reason and next action", async ({ page }) => {
    await openAsAdmin(page, [READY, BLOCKED]);

    await expect(page.getByTestId("admin-held-ratings")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("admin-held-rating")).toHaveCount(2);

    // Verbatim, both of them. Paraphrasing on the client would be a second source of truth for a
    // sentence the database's publication predicate decides.
    await expect(page.getByTestId("held-why").first()).toHaveText(READY.whyHeld);
    await expect(page.getByTestId("held-action").first()).toHaveText(READY.actionToRelease);
    await expect(page.getByTestId("held-why").nth(1)).toHaveText(BLOCKED.whyHeld);
  });

  test("the publish control is live only for the one the server says is publishable", async ({ page }) => {
    await openAsAdmin(page, [READY, BLOCKED]);
    await expect(page.getByTestId("admin-held-ratings")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("held-publish").first()).toBeEnabled();
    await expect(page.getByTestId("held-publish").nth(1)).toBeDisabled();

    /*
      Disabled and still explaining itself. A hidden button reads as a missing feature; a disabled
      one carrying the reason reads as a queue waiting on something, which is what it is.
    */
    await expect(page.getByTestId("held-publish").nth(1))
      .toHaveAttribute("title", BLOCKED.actionToRelease);
  });

  test("publishing sends the review id and reports it published", async ({ page }) => {
    let publishedId: string | null = null;
    await openAsAdmin(page, [READY], (route: any) => {
      publishedId = route.request().url().split("/held-ratings/")[1].split("/")[0];
      return route.fulfill({ json: { reviewId: READY.reviewId, managerId: TEST_MANAGER_ID, published: true } });
    });
    await expect(page.getByTestId("admin-held-ratings")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("held-publish").first().click();

    await expect(page.getByText("Rating published")).toBeVisible({ timeout: 10_000 });
    expect(publishedId).toBe(READY.reviewId);
  });

  /**
   * A refusal shows the server's words.
   *
   * The server re-checks publishability inside its transaction, because another moderator can
   * change the answer between the page being drawn and the button being pressed. A generic
   * "failed" would hide the one useful fact: whether it is still blocked, or somebody else has
   * already dealt with it.
   */
  test("a refusal shows the reason the server gave, not a generic failure", async ({ page }) => {
    await openAsAdmin(page, [READY], (route: any) =>
      /*
        `message`, because that is the key ManagersHandler.handleError actually sends for a
        ServiceException. The mock said `error` and the page read `error`, so the two agreed with
        each other and disagreed with the server - a mocked test passing because both halves of it
        were written by the same misunderstanding. The real server is asked by
        AdminModerationJourneyIntegrationTest.
      */
      route.fulfill({ status: 409, json: { message: "That rating is already live." } }),
    );
    await expect(page.getByTestId("admin-held-ratings")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("held-publish").first().click();

    await expect(page.getByText("That rating is already live.")).toBeVisible({ timeout: 10_000 });
  });

  test("an ordinary signed-in visitor sees no held-ratings section and asks for none", async ({ page }) => {
    let asked = false;
    await page.route(/\/api\/admin\/moderation\/held-ratings/, (route: any) => {
      asked = true;
      return route.fulfill({ json: { data: [READY] } });
    });
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.goto(URL);

    await expect(page.getByTestId("admin-held-ratings")).toHaveCount(0);
    // And the request is never made: the backend would refuse it, but a guaranteed 403 on every
    // profile view is noise in the logs and a round trip for nothing.
    expect(asked).toBe(false);
  });

  test("nothing is drawn when this manager has no held ratings", async ({ page }) => {
    await openAsAdmin(page, []);
    await expect(page.getByTestId("admin-held-ratings")).toHaveCount(0);
  });
});
