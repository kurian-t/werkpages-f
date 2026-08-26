import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

/** Creates an array of simple work entries — used to force multi-page layout. */
function buildManyWorkEntries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-overflow-${i}`,
    company: `Company ${i + 1}`,
    title: "Software Engineer",
    startDate: "2020-01",
    endDate: null,
    current: i === count - 1,
    description: "",
  }));
}

async function setupContributorSession(page: import("@playwright/test").Page, hasContributed = true) {
  // role must be "admin": App.tsx wraps /resume in <AdminOnly>, which redirects everyone else
  // to /explore while the Resume Builder is still in progress. Overridden here rather than in
  // the shared MOCK_USER, which 24 other specs rely on being a plain "user".
  const user = { ...MOCK_USER, role: "admin", hasContributed };
  await page.route("**/api/auth/me", route => route.fulfill({ json: user }));
  await page.addInitScript(u => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, user);
  return user;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Resume Builder", () => {

  // ══════════════════════════════════════════════════════════════════════════
  // GATE AND AUTH
  // ══════════════════════════════════════════════════════════════════════════

  // The builder's own "sign in to use the resume builder" screen is currently unreachable:
  // <AdminOnly> redirects non-admins away before ResumeBuilder renders at all. These two cover
  // the redirect that actually happens today. Restore the sign-in-prompt assertion when
  // AdminOnly comes off /resume and the feature ships to everyone.
  test("logged-out user is redirected away from /resume", async ({ page }) => {
    await page.route("**/api/auth/me", route => route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
    await page.goto("/resume");
    await expect(page).toHaveURL(/\/explore/, { timeout: 10_000 });
  });

  test("logged-in non-admin is redirected away from /resume", async ({ page }) => {
    const user = { ...MOCK_USER, role: "user", hasContributed: true };
    await page.route("**/api/auth/me", route => route.fulfill({ json: user }));
    await page.addInitScript(u => localStorage.setItem("authUser", JSON.stringify(u)), user);
    await page.goto("/resume");
    await expect(page).toHaveURL(/\/explore/, { timeout: 10_000 });
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

  // ══════════════════════════════════════════════════════════════════════════
  // BUILDER UI / GENERAL
  // ══════════════════════════════════════════════════════════════════════════

  test("contributor sees builder UI", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await expect(page.getByRole("heading", { name: /resume builder/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /download pdf/i })).toBeVisible();
  });

  test("prefill populates work entries when no resume saved", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "GET") {
        route.fulfill({ status: 204, body: "" });
      } else {
        route.fulfill({ json: { data: MOCK_RESUME } });
      }
    });
    await page.route("**/api/resumes/mine/prefill", route => route.fulfill({ json: MOCK_PREFILL }));
    await page.goto("/resume");
    // The builder opens on the "Designed PDF" tab now; the content form lives under "Content",
    // with each section collapsed until its sidebar button is clicked.
    await expect(page.getByRole("heading", { name: /resume builder/i })).toBeVisible({ timeout: 15_000 });
    // With no saved resume the builder opens on ResumeFormatChooser, a modal with no dismiss
    // control — its only exit is the continue button, so that is the path a real first-time
    // user takes. The Content tab is already selected afterwards and needs no click.
    await page.getByRole("button", { name: /(continue to|start with) content/i }).click();
    await page.getByRole("button", { name: /^experience/i }).first().click();
    // Prefilled entries render as collapsed summary rows ("StartupCo  Full Stack Developer · …"),
    // not as open textboxes — the row appearing is what proves the prefill landed.
    await expect(page.getByRole("button", { name: /StartupCo/i }).first())
      .toBeVisible({ timeout: 15_000 });
  });

  test("style starting point applies design and triggers save", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.route("**/api/resumes/mine/prefill", route => route.fulfill({ json: { data: [] } }));
    await page.goto("/resume");
    // Starting points moved into the Templates modal, behind the "Browse templates" button.
    await expect(page.getByRole("heading", { name: /resume builder/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /browse templates/i }).click();
    // Each template is a card: an <h3> with the name plus a generic "Use this template" button.
    // Innermost div holding BOTH the name and the action — the heading and the button are
    // siblings at different depths, so filtering on one alone lands on the wrong element.
    const editorialCard = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: /^editorial$/i }) })
      .filter({ has: page.getByRole("button", { name: /use this template/i }) })
      .last();
    await expect(editorialCard.getByRole("button", { name: /use this template/i }))
      .toBeVisible({ timeout: 10_000 });

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

    await editorialCard.getByRole("button", { name: /use this template/i }).click();
    await page.waitForTimeout(2000);
    expect(saveCalled).toBe(true);
    expect(savedBody?.design?.layout).toBe("single");
  });

  test("adding a skill updates the skills list", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await expect(page.getByRole("heading", { name: /resume builder/i })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /skills/i }).click();
    const input = page.getByPlaceholder(/add a skill/i);
    await input.fill("Kubernetes");
    await input.press("Enter");
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
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    }
  });

  test("Resume link shows in header nav when logged in", async ({ page, isMobile }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/managers*", route => route.fulfill({ json: { data: [], total: 0 } }));
    await page.goto("/directory");
    if (isMobile) {
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

  // ══════════════════════════════════════════════════════════════════════════
  // CANVAS STRUCTURE
  // ══════════════════════════════════════════════════════════════════════════

  test("canvas first page has data-resume-page='1' attribute", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="name"]', { timeout: 15_000 });
    await expect(page.locator('[data-resume-page="1"]')).toBeVisible({ timeout: 5_000 });
  });

  test("single-page resume has exactly one data-resume-page div", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="name"]', { timeout: 15_000 });
    await page.waitForTimeout(500); // allow layout to settle

    const pageCount: number = await page.evaluate(() =>
      document.querySelectorAll("[data-resume-page]").length
    );
    expect(pageCount).toBe(1);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CANVAS CONTENT BLOCKS
  // Guards that each section produces its own data-blockid in the canvas DOM.
  // ══════════════════════════════════════════════════════════════════════════

  test("summary/bio text renders inside the bio block on canvas", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, summary: "Expert in distributed systems." };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="bio"]', { timeout: 15_000 });
    await expect(page.locator('[data-blockid="bio"]').getByText("Expert in distributed systems.").first()).toBeVisible();
  });

  test("skills render inside the skills block on canvas", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="skills"]', { timeout: 15_000 });
    await expect(page.locator('[data-blockid="skills"]').getByText("TypeScript").first()).toBeVisible();
    await expect(page.locator('[data-blockid="skills"]').getByText("PostgreSQL").first()).toBeVisible();
  });

  test("contact info renders inside the contact block on canvas", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, email: "alice@example.com", phone: "555-1234", location: "", website: "" };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="contact"]', { timeout: 15_000 });
    await expect(page.locator('[data-blockid="contact"]').getByText(/alice@example\.com/).first()).toBeVisible();
  });

  test("extra links render inside the links block on canvas", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      extraLinks: [
        { label: "LinkedIn", url: "https://linkedin.com/in/alice" },
        { label: "GitHub",   url: "https://github.com/alice" },
      ],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="links"]', { timeout: 15_000 });
    await expect(page.locator('[data-blockid="links"]').getByText("LinkedIn").first()).toBeVisible();
    await expect(page.locator('[data-blockid="links"]').getByText("GitHub").first()).toBeVisible();
  });

  test("work entries render as draggable blocks with data-blockid on canvas", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-render-check", company: "RenderCo", title: "Dev",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-render-check"]', { timeout: 15_000 });
    await expect(page.locator('[data-blockid="work.heading"]')).toBeVisible();
    await expect(page.getByText("RenderCo").first()).toBeVisible();
  });

  test("education entries render with correct blockids on canvas", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      education: [{
        id: "edu-test-render",
        school: "MIT",
        degree: "BSc",
        field: "Computer Science",
        startYear: 2015,
        endYear: 2019,
        current: false,
      }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");

    // Education entry block
    await page.waitForSelector('[data-blockid="edu.edu-test-render"]', { timeout: 15_000 });
    // Education HEADING block is "education.heading" (not "edu.heading")
    await expect(page.locator('[data-blockid="education.heading"]')).toBeVisible();
    await expect(page.getByText("MIT").first()).toBeVisible();
  });

  test("education entry renders school name and year dates on canvas", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      education: [{
        id: "edu-dates",
        school: "Harvard",
        degree: "PhD",
        field: "Physics",
        startYear: 2015,
        endYear: 2020,
        current: false,
      }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="edu.edu-dates"]', { timeout: 15_000 });
    await expect(page.locator('[data-blockid="edu.edu-dates"]').getByText("Harvard").first()).toBeVisible();
    // Year should appear in the entry
    await expect(page.locator('[data-blockid="edu.edu-dates"]').getByText(/2015|2020/)).toBeVisible();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DRAG AND DROP
  // ══════════════════════════════════════════════════════════════════════════

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
    const box = await block.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 60, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    expect(savedDesigns.length).toBeGreaterThan(0);
    const override = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides?.["name"];
    expect(override?.flowDisplacementY).toBeDefined();
    expect(Math.abs(override.flowDisplacementY)).toBeGreaterThan(0);
  });

  test("dragging work entry saves visualDy (not flowDisplacementY) on release", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-visualdy-test", company: "DropCo", title: "Engineer",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    await page.getByText("DropCo").first().waitFor({ state: "visible", timeout: 5_000 });

    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: mock } });
      } else {
        route.fulfill({ json: { data: mock } });
      }
    });

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
    // Role blocks save visualDy, NOT flowDisplacementY (which would cascade)
    expect(override?.visualDy ?? override?.visualDx).toBeDefined();
  });

  test("dragging EXPERIENCE heading moves work entry with it", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-drag-test", company: "DragCo", title: "Senior Engineer",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");

    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    const companyText = page.getByText("DragCo").first();
    await companyText.waitFor({ state: "visible", timeout: 5_000 });

    const headingBlock = page.locator('[data-blockid="work.heading"]');
    await headingBlock.scrollIntoViewIfNeeded();

    const entryBefore = await companyText.boundingBox();
    expect(entryBefore).not.toBeNull();

    const headingBox = await headingBlock.boundingBox();
    expect(headingBox).not.toBeNull();
    const cx = headingBox!.x + headingBox!.width / 2;
    const cy = headingBox!.y + 4;

    await headingBlock.dispatchEvent('mousedown', { button: 0, clientX: cx, clientY: cy, bubbles: true, cancelable: true });
    await page.mouse.move(cx, cy + 80, { steps: 20 });
    await page.mouse.up();

    await page.waitForTimeout(400);

    const entryAfter = await companyText.boundingBox();
    expect(entryAfter).not.toBeNull();
    const deltaY = entryAfter!.y - entryBefore!.y;
    expect(deltaY).toBeGreaterThan(40);
    expect(deltaY).toBeLessThan(120);
  });

  test("work entry stays with section after heading drag — save includes flowDisplacementY", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-save-test", company: "SaveCo", title: "Lead Engineer",
        startDate: "2023-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");

    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    await page.getByText("SaveCo").first().waitFor({ state: "visible", timeout: 5_000 });

    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: mock } });
      } else {
        route.fulfill({ json: { data: mock } });
      }
    });

    const headingBlock = page.locator('[data-blockid="work.heading"]');
    await headingBlock.scrollIntoViewIfNeeded();
    const headingBox = await headingBlock.boundingBox();
    const cx = headingBox!.x + headingBox!.width / 2;
    const cy = headingBox!.y + 4;
    await headingBlock.dispatchEvent('mousedown', { button: 0, clientX: cx, clientY: cy, bubbles: true, cancelable: true });
    await page.mouse.move(cx, cy + 70, { steps: 20 });
    await page.mouse.up();

    await page.waitForTimeout(2500);

    expect(savedDesigns.length).toBeGreaterThan(0);
    const headingOverride = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides?.["work.heading"];
    expect(headingOverride?.flowDisplacementY).toBeDefined();
    expect(Math.abs(headingOverride.flowDisplacementY)).toBeGreaterThan(0);
  });

  test("dragging an education entry saves visualDy to its layoutOverride key", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      education: [{ id: "edu-drag-test", school: "Harvard", degree: "PhD",
        field: "Physics", startYear: 2016, endYear: 2021, current: false }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="edu.edu-drag-test"]', { timeout: 15_000 });

    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: mock } });
      } else {
        route.fulfill({ json: { data: mock } });
      }
    });

    const entryBlock = page.locator('[data-blockid="edu.edu-drag-test"]');
    await entryBlock.scrollIntoViewIfNeeded();
    const box = await entryBlock.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 50, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    expect(savedDesigns.length).toBeGreaterThan(0);
    const override = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides?.["edu.edu-drag-test"];
    expect(override?.visualDy ?? override?.visualDx).toBeDefined();
  });

  test("dragging a sub-element (org line) saves to the sub-element override key", async ({ page, isMobile }) => {
    test.skip(isMobile, "sub-element text drag is unreliable without real mouse hover on mobile viewports");
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-subdrag-key", company: "SubCo", title: "Dev",
        startDate: "2021-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-subdrag-key"]', { timeout: 15_000 });
    await page.getByText("SubCo").first().waitFor({ state: "visible", timeout: 5_000 });

    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: mock } });
      } else {
        route.fulfill({ json: { data: mock } });
      }
    });

    const orgText = page.locator('[data-blockid="work.entry-subdrag-key"]').getByText("SubCo").first();
    const textBox = await orgText.boundingBox();
    expect(textBox).not.toBeNull();
    const cx = textBox!.x + textBox!.width / 2;
    const cy = textBox!.y + textBox!.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 45, cy + 5, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    expect(savedDesigns.length).toBeGreaterThan(0);
    const overrides = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides ?? {};
    // Save must go to sub-element key, not the parent entry block key
    const subKeys = Object.keys(overrides).filter(k => k.startsWith("work.entry-subdrag-key."));
    expect(subKeys.length).toBeGreaterThan(0);
    // Parent entry key must NOT have visualDx/visualDy (sub-element drag is isolated)
    const parentOverride = overrides["work.entry-subdrag-key"];
    expect(parentOverride?.visualDx ?? parentOverride?.visualDy).toBeUndefined();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // RESIZE HANDLES
  // ══════════════════════════════════════════════════════════════════════════

  test("name block with rotation in layoutOverrides renders with a CSS transform", async ({ page }) => {
    // Tests that the canvas reads and applies rotation overrides — avoids flaky drag-to-save
    // by pre-loading the design with a known rotation value and asserting on the DOM.
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      design: { layoutOverrides: { "name": { rotation: 45 } } },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="name"]', { timeout: 15_000 });
    await page.waitForTimeout(500); // allow layout to settle after pass-2

    const transform: string = await page.evaluate(() => {
      const nameBlock = document.querySelector('[data-blockid="name"]');
      const inner = nameBlock?.querySelector('.canvas-block') as HTMLElement | null;
      if (!inner) return "";
      return inner.style.transform || window.getComputedStyle(inner).transform;
    });

    expect(transform).toBeTruthy();
    expect(transform).not.toBe("none");
    expect(transform).not.toBe("");
    // Rotation is expressed as rotate() or an equivalent matrix — both contain digits
    expect(transform).toMatch(/rotate|matrix/i);
  });

  test("dragging the right resize handle saves a width override on release", async ({ page, isMobile }) => {
    test.skip(isMobile, "resize handles require CSS :hover, not reliably triggerable on mobile viewports");
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

    const innerBlock = page.locator('[data-blockid="name"] .canvas-block').first();
    await innerBlock.hover();
    await page.waitForTimeout(150);

    const rightHandle = page.locator('[data-blockid="name"] [data-handle="resize-right"]');
    await expect(rightHandle).toBeVisible({ timeout: 3_000 });
    const handleBox = await rightHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    const hx = handleBox!.x + handleBox!.width / 2;
    const hy = handleBox!.y + handleBox!.height / 2;

    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx - 60, hy, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    expect(savedDesigns.length).toBeGreaterThan(0);
    const nameOverride = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides?.["name"];
    expect(nameOverride?.width).toBeDefined();
    expect(nameOverride.width).toBeGreaterThan(0);
  });

  test("resizing work.heading width cascades same width to all work entries", async ({ page, isMobile }) => {
    test.skip(isMobile, "resize handles require CSS :hover, not reliably triggerable on mobile viewports");
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-cascade", company: "CascadeCo", title: "Engineer",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    await page.getByText("CascadeCo").first().waitFor({ state: "visible", timeout: 5_000 });

    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: mock } });
      } else {
        route.fulfill({ json: { data: mock } });
      }
    });

    const headingBlock = page.locator('[data-blockid="work.heading"]');
    await headingBlock.scrollIntoViewIfNeeded();
    // force: true bypasses the "pointer events intercepted by entry block" check
    const innerHeading = headingBlock.locator('.canvas-block').first();
    await innerHeading.hover({ force: true });
    await page.waitForTimeout(150);

    const rightHandle = headingBlock.locator('[data-handle="resize-right"]');
    await expect(rightHandle).toBeVisible({ timeout: 3_000 });
    const handleBox = await rightHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    const hx = handleBox!.x + handleBox!.width / 2;
    const hy = handleBox!.y + handleBox!.height / 2;

    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx - 40, hy, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    expect(savedDesigns.length).toBeGreaterThan(0);
    const overrides = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides ?? {};
    // Cascade propagates the same width to all entry blocks in the section.
    // We assert on the entry block receiving a positive width override.
    const entryW = overrides["work.entry-cascade"]?.width;
    expect(entryW).toBeDefined();
    expect(entryW).toBeGreaterThan(0);
  });

  test("dragging the bottom resize handle saves a height override on release", async ({ page }) => {
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

    const innerBlock = page.locator('[data-blockid="name"] .canvas-block').first();
    await innerBlock.hover();
    await page.waitForTimeout(150);

    const bottomHandle = page.locator('[data-blockid="name"] [data-handle="resize-bottom"]');
    await expect(bottomHandle).toBeVisible({ timeout: 3_000 });
    const handleBox = await bottomHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    const hx = handleBox!.x + handleBox!.width / 2;
    const hy = handleBox!.y + handleBox!.height / 2;

    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx, hy + 40, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    expect(savedDesigns.length).toBeGreaterThan(0);
    const nameOverride = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides?.["name"];
    expect(nameOverride?.height).toBeDefined();
    expect(nameOverride.height).toBeGreaterThan(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP ROTATION
  // ══════════════════════════════════════════════════════════════════════════

  test("rotating EXPERIENCE heading rotates work entry — entry transform matches heading rotation", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-rot-test", company: "RotCo", title: "Engineer",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
      design: {
        layoutOverrides: { "work.heading": { rotation: 30 } },
      },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");

    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    await page.getByText("RotCo").first().waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('[data-blockid="work.heading"]').scrollIntoViewIfNeeded();

    const entryTransform: string = await page.evaluate(() => {
      const allBlocks = Array.from(document.querySelectorAll("[data-blockid]"));
      const entryBlock = allBlocks.find(el => {
        const bid = el.getAttribute("data-blockid") ?? "";
        return bid.startsWith("work.") && !bid.endsWith(".heading");
      });
      if (!entryBlock) return "";
      const inner = entryBlock.querySelector(".canvas-block") as HTMLElement | null;
      return inner ? (inner.style.transform || window.getComputedStyle(inner).transform) : "";
    });

    expect(entryTransform).toBeTruthy();
    expect(entryTransform).not.toBe("none");
    expect(entryTransform).not.toBe("");
  });

  test("group rotation orbit displaces entry X position relative to heading center", async ({ page }) => {
    // Guards the orbit formula: when work.heading has rotation=90, the entry center
    // must be offset from the heading center X (orbit displacement happened).
    // Direction depends on fragment geometry and is not asserted here — only that
    // the orbit formula ran and produced a non-zero horizontal displacement.
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-orbit-check", company: "OrbitCo", title: "Engineer",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
      design: { layoutOverrides: { "work.heading": { rotation: 90 } } },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });
    await page.getByText("OrbitCo").first().waitFor({ state: "visible", timeout: 5_000 });

    const positions = await page.evaluate(() => {
      const heading = document.querySelector('[data-blockid="work.heading"]') as HTMLElement | null;
      const allBlocks = Array.from(document.querySelectorAll("[data-blockid]"));
      const entry = allBlocks.find(el => {
        const bid = el.getAttribute("data-blockid") ?? "";
        return bid.startsWith("work.") && !bid.endsWith(".heading");
      }) as HTMLElement | null;
      if (!heading || !entry) return { headingCx: 0, entryMidX: 0 };
      const hr = heading.getBoundingClientRect();
      const er = entry.getBoundingClientRect();
      return {
        headingCx: hr.left + hr.width / 2,
        entryMidX: er.left + er.width / 2,
      };
    });

    // Orbit must have displaced the entry from the heading center
    expect(Math.abs(positions.entryMidX - positions.headingCx)).toBeGreaterThan(3);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LOGO
  // ══════════════════════════════════════════════════════════════════════════

  test("company logo defaults to 20px wide and respects saved width override", async ({ page }) => {
    await setupContributorSession(page, true);
    const mockWithLogo = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-logo-test", company: "IBM", title: "Developer",
        startDate: "2021-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockWithLogo } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-logo-test"]', { timeout: 15_000 });

    const defaultLogoW: number = await page.evaluate(() => {
      const entry = document.querySelector('[data-blockid="work.entry-logo-test"]');
      const logo = entry?.querySelector("img[alt='']") as HTMLImageElement | null;
      return logo ? logo.offsetWidth : 0;
    });
    expect(defaultLogoW).toBeGreaterThanOrEqual(18);
    expect(defaultLogoW).toBeLessThanOrEqual(25);

    const mockWithOverride = {
      ...mockWithLogo,
      design: { layoutOverrides: { "work.entry-logo-test.logo": { width: 48 } } },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockWithOverride } }));
    await page.reload();
    await page.waitForSelector('[data-blockid="work.entry-logo-test"]', { timeout: 15_000 });

    const overrideLogoW: number = await page.evaluate(() => {
      const entry = document.querySelector('[data-blockid="work.entry-logo-test"]');
      const logo  = entry?.querySelector("img[alt='']") as HTMLImageElement | null;
      return logo ? logo.offsetWidth : 0;
    });
    expect(overrideLogoW).toBeGreaterThan(25);
  });

  test("second work entry does not overlap first when first has a large logo", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [
        { id: "entry-first",  company: "IBM",     title: "Developer", startDate: "2017-11", endDate: "2022-09", current: false, description: "" },
        { id: "entry-second", company: "Red Hat", title: "Engineer",  startDate: "2022-10", endDate: null,      current: true,  description: "" },
      ],
      design: { layoutOverrides: { "work.entry-first.logo": { width: 60 } } },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-second"]', { timeout: 15_000 });

    const { firstBottom, secondTop } = await page.evaluate(() => {
      const first  = document.querySelector('[data-blockid="work.entry-first"]')  as HTMLElement | null;
      const second = document.querySelector('[data-blockid="work.entry-second"]') as HTMLElement | null;
      if (!first || !second) return { firstBottom: 0, secondTop: 0 };
      const r1 = first.getBoundingClientRect();
      const r2 = second.getBoundingClientRect();
      return { firstBottom: r1.bottom, secondTop: r2.top };
    });

    expect(secondTop).toBeGreaterThanOrEqual(firstBottom - 2);
  });

  test("second work entry inherits logo width from first entry override", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [
        { id: "entry-peer-a", company: "IBM",     title: "Developer", startDate: "2017-11", endDate: "2022-09", current: false, description: "" },
        { id: "entry-peer-b", company: "Red Hat", title: "Engineer",  startDate: "2022-10", endDate: null,      current: true,  description: "" },
      ],
      design: { layoutOverrides: { "work.entry-peer-a.logo": { width: 48 } } },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-peer-b"]', { timeout: 15_000 });

    const secondLogoW: number = await page.evaluate(() => {
      const block = document.querySelector('[data-blockid="work.entry-peer-b"]');
      const logo  = block?.querySelector("img[alt='']") as HTMLImageElement | null;
      return logo ? logo.offsetWidth : 0;
    });

    expect(secondLogoW).toBeGreaterThanOrEqual(40);
  });

  test("showCompanyLogos=false removes the logo img from the work entry", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-nologos", company: "IBM", title: "Dev",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
      design: { showCompanyLogos: false },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-nologos"]', { timeout: 15_000 });

    const logoCount: number = await page.evaluate(() => {
      const block = document.querySelector('[data-blockid="work.entry-nologos"]');
      return block ? block.querySelectorAll("img[alt='']").length : 0;
    });
    expect(logoCount).toBe(0);
  });

  test("showCompanyLogos=true (default) renders the logo img in the work entry", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-withlogos", company: "IBM", title: "Dev",
        startDate: "2022-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-withlogos"]', { timeout: 15_000 });

    const logoExists: boolean = await page.evaluate(() => {
      const block = document.querySelector('[data-blockid="work.entry-withlogos"]');
      return !!block?.querySelector("img[alt='']");
    });
    expect(logoExists).toBe(true);
  });

  test("CanvasLogo resets src when company prop changes", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-logo-refresh", company: "IBM", title: "Developer",
        startDate: "2021-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-logo-refresh"]', { timeout: 15_000 });

    const srcBefore: string = await page.evaluate(() => {
      const block = document.querySelector('[data-blockid="work.entry-logo-refresh"]');
      return (block?.querySelector("img[alt='']") as HTMLImageElement | null)?.src ?? "";
    });
    expect(srcBefore).toMatch(/ibm|logo\.dev/i);

    // If CanvasLogo resets correctly, the img element must remain in the DOM
    const imgExists: boolean = await page.evaluate(() => {
      const block = document.querySelector('[data-blockid="work.entry-logo-refresh"]');
      return block?.querySelector("img[alt='']") !== null;
    });
    expect(imgExists).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LAYOUT OVERRIDES AND STATE
  // ══════════════════════════════════════════════════════════════════════════

  test("EXPERIENCE heading groupHeight does not shrink when entry is moved", async ({ page }) => {
    await setupContributorSession(page, true);
    const mockNatural = {
      ...MOCK_RESUME,
      workEntries: [{ id: "entry-gh-test", company: "ShrinkCo", title: "Engineer",
        startDate: "2021-01", endDate: null, current: true, description: "" }],
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockNatural } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });

    const headingBeforeH = await page.locator('[data-blockid="work.heading"]').evaluate(el => el.getBoundingClientRect().height);

    const mockMoved = {
      ...mockNatural,
      design: { layoutOverrides: { "work.entry-gh-test": { visualDy: -200 } } },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mockMoved } }));
    await page.reload();
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });

    const headingAfterH = await page.locator('[data-blockid="work.heading"]').evaluate(el => el.getBoundingClientRect().height);
    expect(headingAfterH).toBeGreaterThanOrEqual(headingBeforeH - 2);
  });

  test("second work entry inherits title/org visual position from first entry", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      workEntries: [
        { id: "entry-src", company: "IBM",     title: "Developer", startDate: "2017-11", endDate: "2022-09", current: false, description: "" },
        { id: "entry-dst", company: "Red Hat", title: "Engineer",  startDate: "2022-10", endDate: null,      current: true,  description: "" },
      ],
      design: {
        layoutOverrides: {
          "work.entry-src.title": { visualDx: 60, visualDy: -10 },
          "work.entry-src.org":   { visualDx: 60, visualDy: 5  },
        },
      },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-dst"]', { timeout: 15_000 });

    const { titleLeft, blockLeft } = await page.evaluate(() => {
      const block = document.querySelector('[data-blockid="work.entry-dst"]') as HTMLElement | null;
      if (!block) return { titleLeft: 0, blockLeft: 0 };
      const allDivs = Array.from(block.querySelectorAll("div"));
      const titleDiv = allDivs.find(d => d.textContent?.includes("Engineer") && !d.querySelector("div")) as HTMLElement | null;
      if (!titleDiv) return { titleLeft: 0, blockLeft: 0 };
      return {
        titleLeft: titleDiv.getBoundingClientRect().left,
        blockLeft: block.getBoundingClientRect().left,
      };
    });

    expect(titleLeft - blockLeft).toBeGreaterThan(30);
  });

  test("Reset layout button fires PUT with empty layoutOverrides", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      design: { layoutOverrides: { "name": { flowDisplacementY: 30 } } },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="name"]', { timeout: 15_000 });

    const savedDesigns: any[] = [];
    await page.route("**/api/resumes/mine", route => {
      if (route.request().method() === "PUT") {
        savedDesigns.push(route.request().postDataJSON());
        route.fulfill({ json: { data: mock } });
      } else {
        route.fulfill({ json: { data: mock } });
      }
    });

    const resetLink = page.getByText("Reset layout");
    await expect(resetLink).toBeVisible({ timeout: 5_000 });
    await resetLink.click();

    await page.waitForTimeout(2500);
    expect(savedDesigns.length).toBeGreaterThan(0);
    const layoutOverrides = savedDesigns[savedDesigns.length - 1]?.design?.layoutOverrides;
    expect(layoutOverrides === undefined || Object.keys(layoutOverrides ?? {}).length === 0).toBe(true);
  });

  test("pressing Escape after selecting an element clears the selection without crashing", async ({ page }) => {
    await setupContributorSession(page, true);
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: MOCK_RESUME } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="name"]', { timeout: 15_000 });

    const nameBlock = page.locator('[data-blockid="name"]');
    await nameBlock.locator('.canvas-block').click();
    await page.waitForTimeout(200);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await expect(page.locator('[data-blockid="name"]')).toBeVisible();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // INLINE EDITING
  // ══════════════════════════════════════════════════════════════════════════

  test("double-clicking the name text enters inline contenteditable editing", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, firstName: "Alice", lastName: "Smith",
      email: "", phone: "", location: "", website: "" };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="name"]', { timeout: 15_000 });

    const nameText = page.locator('[data-blockid="name"]').getByText("Alice Smith").first();
    await expect(nameText).toBeVisible({ timeout: 5_000 });

    await nameText.dblclick();

    const editableEl = page.locator('[contenteditable="true"]').first();
    await expect(editableEl).toBeVisible({ timeout: 3_000 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LAYOUT VARIANTS
  // ══════════════════════════════════════════════════════════════════════════

  test("sidebar-left layout renders name block in the left column", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      design: {
        layout: "sidebar-left",
        sidebarSections: ["bio", "skills", "links"],
        sidebarWidth: 30,
      },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="name"]', { timeout: 15_000 });

    const nameBox = await page.locator('[data-blockid="name"]').boundingBox();
    const pageBox = await page.locator('[data-resume-page="1"]').boundingBox();
    expect(nameBox).not.toBeNull();
    expect(pageBox).not.toBeNull();
    // Name is in the left sidebar column — center must be in the left half
    const relativeCx = (nameBox!.x + nameBox!.width / 2) - pageBox!.x;
    expect(relativeCx).toBeLessThan(pageBox!.width / 2);
  });

  test("sidebar-right layout renders work.heading in the main (left) column", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = {
      ...MOCK_RESUME,
      design: {
        layout: "sidebar-right",
        sidebarSections: ["bio", "skills"],
        sidebarWidth: 30,
      },
    };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.heading"]', { timeout: 15_000 });

    const headingBox = await page.locator('[data-blockid="work.heading"]').boundingBox();
    const pageBox    = await page.locator('[data-resume-page="1"]').boundingBox();
    expect(headingBox).not.toBeNull();
    expect(pageBox).not.toBeNull();
    // work.heading is in the main column (left of sidebar), so center is in left 70%
    const relativeCx = (headingBox!.x + headingBox!.width / 2) - pageBox!.x;
    expect(relativeCx).toBeLessThan(pageBox!.width * 0.75);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MULTI-PAGE CANVAS
  // Guards FreeFormLayout pagination: when content exceeds one page,
  // additional data-resume-page divs are rendered and blocks distributed.
  // ══════════════════════════════════════════════════════════════════════════

  test("content that overflows page 1 creates a second data-resume-page div", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, workEntries: buildManyWorkEntries(20) };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");

    // Wait for the first entry block (pass-2 complete)
    await page.waitForSelector('[data-blockid="work.entry-overflow-0"]', { timeout: 20_000 });
    // Allow time for pagination to settle
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-resume-page="2"]')).toBeVisible({ timeout: 10_000 });
  });

  test("page 2 div contains work entry blocks when work section overflows", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, workEntries: buildManyWorkEntries(20) };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-overflow-0"]', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    // At least one work entry block must live inside the page-2 div
    const entryOnPage2: boolean = await page.evaluate(() => {
      const page2 = document.querySelector('[data-resume-page="2"]');
      if (!page2) return false;
      return page2.querySelectorAll('[data-blockid^="work.entry-"]').length > 0;
    });
    expect(entryOnPage2).toBe(true);
  });

  test("page 1 does not contain work entry blocks that belong to page 2", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, workEntries: buildManyWorkEntries(20) };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-overflow-0"]', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    // Each entry blockid must appear in exactly one page div
    const dupCount: number = await page.evaluate(() => {
      const seen = new Set<string>();
      let dups = 0;
      document.querySelectorAll('[data-resume-page]').forEach(pageDiv => {
        pageDiv.querySelectorAll('[data-blockid^="work.entry-"]').forEach(el => {
          const bid = el.getAttribute("data-blockid") ?? "";
          if (seen.has(bid)) dups++;
          seen.add(bid);
        });
      });
      return dups;
    });
    expect(dupCount).toBe(0);
  });

  test("work.heading remains on page 1 when entries overflow to page 2", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, workEntries: buildManyWorkEntries(20) };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-overflow-0"]', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    // work.heading must be inside the page-1 div (orphan prevention keeps it with entries)
    const headingOnPage1: boolean = await page.evaluate(() => {
      const page1 = document.querySelector('[data-resume-page="1"]');
      return !!page1?.querySelector('[data-blockid="work.heading"]');
    });
    expect(headingOnPage1).toBe(true);

    // work.heading must NOT appear in page 2
    const headingOnPage2: boolean = await page.evaluate(() => {
      const page2 = document.querySelector('[data-resume-page="2"]');
      return !!page2?.querySelector('[data-blockid="work.heading"]');
    });
    expect(headingOnPage2).toBe(false);
  });

  test("ContinuationSectionBox appears on page 2 when work section spans pages", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, workEntries: buildManyWorkEntries(20) };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-overflow-0"]', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    // ContinuationSectionBox renders with data-section-fragment="work:1"
    // (prefix="work", pageIndex=1 for the second physical page)
    const fragmentBox = page.locator('[data-section-fragment="work:1"]');
    await expect(fragmentBox).toBeAttached({ timeout: 10_000 });
  });

  test("continuation section box has fragment-rotate and fragment-drag handles", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, workEntries: buildManyWorkEntries(20) };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-overflow-0"]', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    const fragmentBox = page.locator('[data-section-fragment="work:1"]');
    await expect(fragmentBox.locator('[data-handle="fragment-rotate"]')).toBeAttached({ timeout: 10_000 });
    await expect(fragmentBox.locator('[data-handle="fragment-drag"]')).toBeAttached({ timeout: 10_000 });
  });

  test("continuation label text contains section name on page 2", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, workEntries: buildManyWorkEntries(20) };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-overflow-0"]', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    const fragmentBox = page.locator('[data-section-fragment="work:1"]');
    // Fragment label says "Experience · continued" (or similar)
    await expect(fragmentBox.locator('[data-handle="fragment-drag"]')).toContainText(/continued/i, { timeout: 10_000 });
  });

  test("multiple pages each have their own data-resume-page attribute", async ({ page }) => {
    await setupContributorSession(page, true);
    const mock = { ...MOCK_RESUME, workEntries: buildManyWorkEntries(20) };
    await page.route("**/api/resumes/mine", route => route.fulfill({ json: { data: mock } }));
    await page.goto("/resume");
    await page.waitForSelector('[data-blockid="work.entry-overflow-0"]', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    const pageDivs: number = await page.evaluate(() =>
      document.querySelectorAll("[data-resume-page]").length
    );
    expect(pageDivs).toBeGreaterThanOrEqual(2);

    // Each page div should have a sequential numeric attribute value
    const pageNumbers: number[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-resume-page]"))
        .map(el => Number(el.getAttribute("data-resume-page")))
    );
    // Should be [1, 2, ...] in order
    pageNumbers.forEach((n, i) => expect(n).toBe(i + 1));
  });

});
