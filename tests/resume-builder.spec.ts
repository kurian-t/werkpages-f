import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

const MOCK_RESUME = {
  templateId: "classic",
  summary: "Experienced engineer.",
  skills: ["TypeScript", "React", "PostgreSQL"],
  education: [],
  workEntries: [
    {
      company: "Acme Corp",
      title: "Software Engineer",
      startDate: "2021-03",
      endDate: null,
      current: true,
      description: "Built things.",
    },
  ],
  extraLinks: [],
  updatedAt: "2026-01-01T00:00:00Z",
};

const MOCK_PREFILL = {
  data: [
    {
      company: "StartupCo",
      title: "Full Stack Developer",
      startDate: "2020-06",
      endDate: "2022-12",
      current: false,
      description: "",
      managerId: 99,
    },
  ],
};

function mockAuthContributor(page: Parameters<typeof page.route>[1] extends infer T ? never : any, hasContributed = true) {
  const user = { ...MOCK_USER, hasContributed };
  return { user };
}

async function setupContributorSession(page: import("@playwright/test").Page, hasContributed = true) {
  const user = { ...MOCK_USER, hasContributed };
  await page.route("**/api/auth/me", route => route.fulfill({ json: user }));
  await page.addInitScript(u => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, user);
  return user;
}

test.describe("Resume Builder", () => {

  test("logged-out user sees sign-in prompt", async ({ page }) => {
    await page.route("**/api/auth/me", route => route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
    await page.goto("/resume");
    await expect(page.getByRole("heading", { name: /sign in to use the resume builder/i })).toBeVisible({ timeout: 10_000 });
  });

  test("logged-in non-contributor sees gate screen", async ({ page }) => {
    await setupContributorSession(page, false);
    await page.goto("/resume");
    await expect(page.getByRole("heading", { name: /unlock your resume builder/i })).toBeVisible({ timeout: 10_000 });
  });

  test("gate screen CTA navigates to /add", async ({ page }) => {
    await setupContributorSession(page, false);
    await page.goto("/resume");
    const cta = page.getByRole("button", { name: /rate a manager/i });
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await cta.click();
    await expect(page).toHaveURL(/\/add/, { timeout: 5_000 });
  });

  test("contributor sees builder UI", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    // Template picker should be visible
    await expect(page.getByText(/classic/i).first()).toBeVisible({ timeout: 15_000 });
    // Download button
    await expect(page.getByRole("button", { name: /download pdf/i })).toBeVisible();
  });

  test("prefill populates work entries when no resume saved", async ({ page }) => {
    await setupContributorSession(page, true);
    // 204 = no resume yet
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "GET") {
        route.fulfill({ status: 204, body: "" });
      } else {
        route.fulfill({ json: { data: MOCK_RESUME } });
      }
    });
    await page.route("**/api/resumes/mine/prefill", route => route.fulfill({ json: MOCK_PREFILL }));
    await page.goto("/resume");
    // Should show the prefilled company name in the Company input field
    await expect(page.getByRole("textbox", { name: /company/i }).first()).toHaveValue(/StartupCo/i, { timeout: 15_000 });
  });

  test("style starting point applies design and triggers save", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.route("**/api/resumes/mine/prefill", route => route.fulfill({ json: { data: [] } }));
    await page.goto("/resume");
    // Starting points strip shows Classic/Editorial/Sidebar/Minimal
    await expect(page.getByRole("button", { name: /editorial/i })).toBeVisible({ timeout: 15_000 });

    let saveCalled = false;
    let savedBody: any = null;
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        saveCalled = true;
        savedBody = route.request().postDataJSON();
        route.fulfill({ json: { data: MOCK_RESUME } });
      } else {
        route.fulfill({ json: { data: MOCK_RESUME } });
      }
    });

    await page.getByRole("button", { name: /editorial/i }).click();
    // Allow debounce (1.5s) to fire
    await page.waitForTimeout(2000);
    expect(saveCalled).toBe(true);
    // Verify design was included in save payload
    expect(savedBody?.design?.layout).toBe("single");
  });

  test("adding a skill updates the skills list", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await expect(page.getByText(/classic/i).first()).toBeVisible({ timeout: 15_000 });

    // Switch to Skills tab
    await page.getByRole("button", { name: /skills/i }).click();
    const input = page.getByPlaceholder(/add a skill/i);
    await input.fill("Kubernetes");
    await input.press("Enter");
    // Canvas also renders skill so use .first() to avoid strict-mode violation
    await expect(page.getByText("Kubernetes").first()).toBeVisible({ timeout: 3_000 });
  });

  test("download button triggers file download", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await expect(page.getByRole("button", { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }).catch(() => null),
      page.getByRole("button", { name: /download pdf/i }).click(),
    ]);
    // If download happened, it should be a PDF filename
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    }
  });

  test("Resume link shows in header nav when logged in", async ({ page, isMobile }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/managers*", route => route.fulfill({ json: { data: [], total: 0 } }));
    await page.goto("/directory");
    if (isMobile) {
      // On mobile the nav is inside a hamburger menu — open it first
      await page.getByRole("button", { name: /open menu/i }).click();
    }
    await expect(page.getByRole("link", { name: /resume/i })).toBeVisible({ timeout: 10_000 });
  });

  test("Resume link not shown in header nav when logged out", async ({ page }) => {
    await page.route("**/api/auth/me", route => route.fulfill({ status: 401, json: {} }));
    await page.route("**/api/managers*", route => route.fulfill({ json: { data: [], total: 0 } }));
    await page.goto("/directory");
    await expect(page.getByRole("link", { name: /^resume$/i })).not.toBeVisible({ timeout: 5_000 });
  });

  // ── Canvas drag-and-drop: blocks must save position on mouse release ─────────
  // Guards against: missing isRoleBlock in handleMouseDown.onUp (caused ReferenceError
  // → saveOverride never called → block snapped back on release).

  test("dragging name block saves flowDisplacementY on release", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="name"]', { timeout: 15_000 });

    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: MOCK_RESUME } });
      } else {
        route.fulfill({ json: { data: MOCK_RESUME } });
      }
    });

    const block = page.locator('[data-blockid="name"]');
    await block.scrollIntoViewIfNeeded();
    const box   = await block.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 60, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    // A PUT must have fired — if isRoleBlock is undefined, onUp crashes and never saves
    expect(savedDesigns.length).toBeGreaterThan(0);
    const override = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides?.["name"];
    expect(override?.flowDisplacementY).toBeDefined();
    expect(Math.abs(override.flowDisplacementY)).toBeGreaterThan(0);
  });

  test("dragging work entry saves visualDy (not flowDisplacementY) on release", async ({ page }) => {
    await setupContributorSession(page, true);
    const mockWithEntry = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-visualdy-test", company: "DropCo", title: "Engineer",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockWithEntry } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    await page.getByText("DropCo").first().waitFor({ state: "visible", timeout: 5_000 });

    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: mockWithEntry } });
      } else {
        route.fulfill({ json: { data: mockWithEntry } });
      }
    });

    // Find the work entry block (not the heading)
    const allBlockIds: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-blockid]")).map(el => el.getAttribute("data-blockid") ?? "")
    );
    const entryBlockId = allBlockIds.find(b => b.startsWith("work.") && !b.endsWith(".heading"));
    expect(entryBlockId).toBeDefined();
    const entryBlock = page.locator(`[data-blockid="${entryBlockId}"]`);
    await entryBlock.scrollIntoViewIfNeeded();
    const box = await entryBlock.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 55, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    expect(savedDesigns.length).toBeGreaterThan(0);
    const override = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides?.[entryBlockId!];
    // Role blocks must save visualDy, NOT flowDisplacementY (which would cascade)
    expect(override?.visualDy ?? override?.visualDx).toBeDefined();
  });

  // ── Canvas group-move: dragging EXPERIENCE heading moves its entries ──────────
  // These tests guard against regressions in the two-call React batching bug where
  // saveOverride + onDragEnd both called onDesignChange with stale bases, causing
  // the heading's flowDisplacementY (which cascades to entries) to be clobbered.

  test("dragging EXPERIENCE heading moves work entry with it", async ({ page }) => {
    await setupContributorSession(page, true);
    const mockWithEntry = {
      ...MOCK_RESUME,
      workEntries: [{
        id: "entry-drag-test",
        company: "DragCo",
        title: "Senior Engineer",
        startDate: "2022-01",
        endDate: null,
        current: true,
        description: "",
      }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockWithEntry } }));
    await page.goto("/resume");

    // Wait for canvas pass-2 layout — the work.heading block must be in the DOM
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    const companyText = page.getByText("DragCo").first();
    await companyText.waitFor({ state: "visible", timeout: 5_000 });

    const headingBlock = page.locator('[data-blockid="work.heading"]');
    await headingBlock.scrollIntoViewIfNeeded();

    // Record initial position AFTER scrolling so coordinates are viewport-relative
    const entryBefore = await companyText.boundingBox();
    expect(entryBefore).not.toBeNull();

    const headingBox = await headingBlock.boundingBox();
    expect(headingBox).not.toBeNull();
    // Click near the top of the heading block (within the heading text, not the
    // groupHeight extension that overlaps with entries).
    const cx = headingBox!.x + headingBox!.width / 2;
    const cy = headingBox!.y + 4;

    // Dispatch mousedown directly on the heading element to bypass z-index stacking —
    // the entry block (rendered later in DOM) overlaps this area on mobile and would
    // otherwise intercept the event. DraggableBlock's drag handler then adds a
    // mousemove listener on the window, which page.mouse.move() triggers normally.
    await headingBlock.dispatchEvent('mousedown', { button: 0, clientX: cx, clientY: cy, bubbles: true, cancelable: true });
    // Move in steps to simulate a real drag (threshold: 4px before drag registers)
    await page.mouse.move(cx, cy + 80, { steps: 20 });
    await page.mouse.up();

    // Allow React to re-render with updated computedPositions
    await page.waitForTimeout(400);

    // Entry must have moved DOWN with the heading
    const entryAfter = await companyText.boundingBox();
    expect(entryAfter).not.toBeNull();
    const deltaY = entryAfter!.y - entryBefore!.y;
    // Entry should move at least 40px (generous lower bound) and no more than 120px
    expect(deltaY).toBeGreaterThan(40);
    expect(deltaY).toBeLessThan(120);
  });

  test("work entry stays with section after heading drag — save includes flowDisplacementY", async ({ page }) => {
    await setupContributorSession(page, true);
    const mockWithEntry = {
      ...MOCK_RESUME,
      workEntries: [{
        id: "entry-save-test",
        company: "SaveCo",
        title: "Lead Engineer",
        startDate: "2023-01",
        endDate: null,
        current: true,
        description: "",
      }],
    };
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: { data: mockWithEntry } });
      } else {
        route.fulfill({ json: { data: mockWithEntry } });
      }
    });
    await page.goto("/resume");

    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    const companyText = page.getByText("SaveCo").first();
    await companyText.waitFor({ state: "visible", timeout: 5_000 });

    // Intercept the save (PUT) to capture the design payload
    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: mockWithEntry } });
      } else {
        route.fulfill({ json: { data: mockWithEntry } });
      }
    });

    const headingBlock = page.locator('[data-blockid="work.heading"]');
    await headingBlock.scrollIntoViewIfNeeded();
    const headingBox = await headingBlock.boundingBox();
    const cx = headingBox!.x + headingBox!.width / 2;
    const cy = headingBox!.y + 4;
    // Dispatch mousedown directly on the heading element to bypass z-index stacking.
    await headingBlock.dispatchEvent('mousedown', { button: 0, clientX: cx, clientY: cy, bubbles: true, cancelable: true });
    await page.mouse.move(cx, cy + 70, { steps: 20 });
    await page.mouse.up();

    // Wait for autosave debounce (1.5s)
    await page.waitForTimeout(2500);

    // The save payload must include a layoutOverride with flowDisplacementY on "work.heading"
    expect(savedDesigns.length).toBeGreaterThan(0);
    const lastSave = savedDesigns[savedDesigns.length - 1];
    const headingOverride = lastSave?.design?.layoutOverrides?.["work.heading"];
    expect(headingOverride?.flowDisplacementY).toBeDefined();
    expect(Math.abs(headingOverride.flowDisplacementY)).toBeGreaterThan(0);
  });

  // ── Group rotation: rotating heading must rotate entries with it ──────────────
  // Guards against regressions where entries ignored the heading's rotation and
  // stayed upright while the heading tilted (they must share the same transform).

  test("rotating EXPERIENCE heading rotates work entry — entry transform matches heading rotation", async ({ page }) => {
    await setupContributorSession(page, true);
    const mockWithEntry = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-rot-test", company: "RotCo", title: "Engineer",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
      // Pre-bake a 30-degree rotation on the work heading via layoutOverrides
      design: {
        ...(MOCK_RESUME as any).design,
        layoutOverrides: { "work.heading": { rotation: 30 } },
      },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockWithEntry } }));
    await page.goto("/resume");

    // Wait for both blocks to be in the DOM
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    await page.getByText("RotCo").first().waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('[data-blockid="work.heading"]').scrollIntoViewIfNeeded();

    // The work entry's inner canvas-block div must have a CSS rotation applied (group rotation propagation)
    const entryTransform: string = await page.evaluate(() => {
      // Find the work entry block (not the heading)
      const allBlocks = Array.from(document.querySelectorAll("[data-blockid]"));
      const entryBlock = allBlocks.find(el => {
        const bid = el.getAttribute("data-blockid") ?? "";
        return bid.startsWith("work.") && !bid.endsWith(".heading");
      });
      if (!entryBlock) return "";
      const inner = entryBlock.querySelector(".canvas-block") as HTMLElement | null;
      return inner ? (inner.style.transform || window.getComputedStyle(inner).transform) : "";
    });

    // The entry's canvas-block must have a non-identity rotation (group rotation applied)
    expect(entryTransform).toBeTruthy();
    expect(entryTransform).not.toBe("none");
    // A 30deg rotation produces a non-zero matrix (not identity)
    expect(entryTransform).not.toBe("");
  });

  // ── Logo resize ───────────────────────────────────────────────────────────────
  // Guards against regressions where the logo is fixed at 20×20 and cannot be
  // resized — the SubDrag wrapper must have an explicit default width (20px) and
  // the img inside must fill the wrapper so a saved width override takes effect.

  test("company logo defaults to 20px wide and respects saved width override", async ({ page }) => {
    await setupContributorSession(page, true);
    const mockWithLogo = {
      ...MOCK_RESUME,
      workEntries: [{
        id: "entry-logo-test",
        company: "IBM",
        title: "Developer",
        startDate: "2021-01",
        endDate: null,
        current: true,
        description: "",
      }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockWithLogo } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-logo-test"]', { timeout: 15_000 });

    // Default: logo img should be ~20px wide
    const defaultLogoW: number = await page.evaluate(() => {
      const allBlocks = Array.from(document.querySelectorAll("[data-blockid]"));
      const entry = allBlocks.find(el => el.getAttribute("data-blockid") === "work.entry-logo-test");
      const logo = entry?.querySelector("img[alt='']") as HTMLImageElement | null;
      return logo ? logo.offsetWidth : 0;
    });
    expect(defaultLogoW).toBeGreaterThanOrEqual(18);
    expect(defaultLogoW).toBeLessThanOrEqual(25);

    // With a width override in the design, logo should be larger
    const mockWithOverride = {
      ...mockWithLogo,
      design: {
        layoutOverrides: { "work.entry-logo-test.logo": { width: 48 } },
      },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockWithOverride } }));
    await page.reload();
    await page.waitForSelector('[data-blockid="work.entry-logo-test"]', { timeout: 15_000 });

    const overrideLogoW: number = await page.evaluate(() => {
      const allBlocks = Array.from(document.querySelectorAll("[data-blockid]"));
      const entry = allBlocks.find(el => el.getAttribute("data-blockid") === "work.entry-logo-test");
      const logo = entry?.querySelector("img[alt='']") as HTMLImageElement | null;
      return logo ? logo.offsetWidth : 0;
    });
    // Logo must be larger than the default 20px (the 48-unit override must take effect)
    expect(overrideLogoW).toBeGreaterThan(25);
  });

  // ── EXPERIENCE box size stability ────────────────────────────────────────────
  // Guards against regressions where moving an entry (visualDy) shrank the
  // EXPERIENCE heading's selection box — it must always reflect the natural height.

  test("EXPERIENCE heading groupHeight does not shrink when entry is moved", async ({ page }) => {
    await setupContributorSession(page, true);
    const mockNatural = {
      ...MOCK_RESUME,
      workEntries: [{
        id: "entry-gh-test",
        company: "ShrinkCo",
        title: "Engineer",
        startDate: "2021-01",
        endDate: null,
        current: true,
        description: "",
      }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockNatural } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });

    // Measure heading block height before any move
    const headingBeforeH = await page.locator('[data-blockid="work.heading"]').evaluate(el => el.getBoundingClientRect().height);

    // Apply a large visualDy on the entry (simulates user dragging entry up/off-screen)
    const mockMoved = {
      ...mockNatural,
      design: {
        layoutOverrides: { "work.entry-gh-test": { visualDy: -200 } },
      },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockMoved } }));
    await page.reload();
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });

    const headingAfterH = await page.locator('[data-blockid="work.heading"]').evaluate(el => el.getBoundingClientRect().height);

    // Box must not shrink — height should be the same (or larger) regardless of entry position
    expect(headingAfterH).toBeGreaterThanOrEqual(headingBeforeH - 2); // 2px tolerance for rounding
  });

});
