import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://localhost:5175" });

test("debug drag", async ({ page }) => {
  const user = { id: "u1", email: "test@example.com", firstName: "Test", lastName: "User", hasContributed: true };
  await page.route("**/api/auth/me", r => r.fulfill({ json: user }));
  await page.addInitScript(u => localStorage.setItem("authUser", JSON.stringify(u)), user);
  
  const mockResume = {
    templateId: "classic",
    summary: "Exp eng.",
    skills: ["TypeScript"],
    education: [],
    workEntries: [{ id: "e1", company: "DragCo", title: "Engineer", startDate: "2022-01", endDate: null, current: true, description: "" }],
    extraLinks: [],
    updatedAt: "2026-01-01T00:00:00Z",
  };
  await page.route("**/api/resumes/mine", r => r.fulfill({ json: { data: mockResume } }));
  await page.goto("/resume");

  const experienceText = page.getByText("Experience").first();
  await experienceText.waitFor({ state: "visible", timeout: 15_000 });
  const companyText = page.getByText("DragCo").first();
  await companyText.waitFor({ state: "visible", timeout: 5_000 });

  const headingBox = await experienceText.boundingBox();
  const companyBefore = await companyText.boundingBox();
  
  console.log("Heading box:", JSON.stringify(headingBox));
  console.log("Company before:", JSON.stringify(companyBefore));
  
  // Check element at click position
  const elemAtPos = await page.evaluate(({x, y}) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}.${el.className} textContent="${el.textContent?.slice(0,30)}"` : "none";
  }, { x: headingBox!.x + headingBox!.width/2, y: headingBox!.y + headingBox!.height/2 });
  console.log("Element at heading center:", elemAtPos);
  
  const cx = headingBox!.x + headingBox!.width / 2;
  const cy = headingBox!.y + headingBox!.height / 2;
  
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  
  // Check if isDragging class is applied after some movement
  await page.mouse.move(cx, cy + 20, { steps: 5 });
  
  const isDragging = await page.evaluate(() => {
    return !!document.querySelector('.canvas-block--dragging');
  });
  console.log("Is dragging after 20px move:", isDragging);
  
  await page.mouse.move(cx, cy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  
  const companyAfter = await companyText.boundingBox();
  console.log("Company after:", JSON.stringify(companyAfter));
  console.log("DeltaY:", companyAfter!.y - companyBefore!.y);
  
  // Check if Reset layout button appeared (indicates override was saved)
  const resetVisible = await page.locator('text=Reset layout').isVisible();
  console.log("Reset layout visible:", resetVisible);
});
