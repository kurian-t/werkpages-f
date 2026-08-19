import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

const MOCK_RESUME = {
  templateId: "classic",
  summary: "Exp.",
  skills: ["TypeScript"],
  education: [],
  workEntries: [{ id: "e1", company: "TestCo", title: "Eng", startDate: "2022-01", endDate: null, current: true, description: "" }],
  extraLinks: [],
  updatedAt: "2026-01-01T00:00:00Z",
};

test("check data-blockid attr", async ({ page }) => {
  await page.route("**/api/auth/me", r => r.fulfill({ json: { ...MOCK_USER, hasContributed: true } }));
  await page.addInitScript(u => localStorage.setItem("authUser", JSON.stringify(u)), { ...MOCK_USER, hasContributed: true });
  await page.route("**/api/resumes/mine", r => r.fulfill({ json: { data: MOCK_RESUME } }));
  await page.goto("/resume");
  
  // Wait for canvas to render
  await page.waitForTimeout(5000);
  
  // Check what data-blockid attrs exist
  const blockIds = await page.evaluate(() => {
    const els = document.querySelectorAll('[data-blockid]');
    return Array.from(els).map(e => e.getAttribute('data-blockid'));
  });
  console.log("data-blockid elements found:", JSON.stringify(blockIds));
  
  // Check all divs with position absolute (should be the DraggableBlocks)
  const posAbsoluteCount = await page.evaluate(() => {
    const all = document.querySelectorAll('div[style*="position: absolute"]');
    return all.length;
  });
  console.log("position:absolute divs count:", posAbsoluteCount);
  
  expect(blockIds.length).toBeGreaterThan(0);
});
