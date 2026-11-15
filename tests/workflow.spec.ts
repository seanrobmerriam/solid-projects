import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";

test("project save opens its page and issue dispatch preserves settings and output", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await signIn(page);
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("menuitem", { name: /^Projects/ }).first().click();
  await page.getByRole("button", { name: "+ Project", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Name", { exact: true }).fill("Cancelled project");
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole("button", { name: "+ Project", exact: true }).click();
  await modal.getByLabel("Name", { exact: true }).fill("Agent workflow project");
  await modal.getByLabel("Description", { exact: false }).fill("A small local project");
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/projects-/);
  await expect(page.getByRole("heading", { name: "Agent workflow project", exact: true })).toBeVisible();
  await expect(page.getByText("No tasks yet.", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/project-workflow-desktop.png" });
  const projectUrl = page.url();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("menuitem", { name: /^Agents/ }).click();
  await page.getByLabel("Dispatch prompt").fill("Address this issue carefully.");
  await page.getByLabel("instructions.md").fill("# Primary instructions\nUse only project tools.");
  await page.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Agent settings saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Dispatch prompt")).toHaveValue("Address this issue carefully.");
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await modal.getByLabel("Name", { exact: true }).fill("Write a greeting");
  await modal.getByLabel("Description", { exact: false }).fill("Create hello.txt containing hello.");
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Agent output" })).toBeVisible();
  // CI has no model credential: prove the actual dispatch failure is visible,
  // rather than returning fake model output or leaving a run spinning forever.
  await expect(page.getByRole("dialog", { name: "Agent output" })).toContainText("MINIMAX_API_KEY", { timeout: 30_000 });
  await page.screenshot({ path: "test-results/agent-drawer-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/agent-drawer-mobile.png" });
  await page.getByRole("button", { name: "Close agent output" }).click();
  await page.getByRole("button", { name: "View output", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Agent output" })).toContainText("MINIMAX_API_KEY");
  expect(errors).toEqual([]);
});

test("workflow endpoints require authentication", async ({ request }) => {
  for (const path of ["settings", "projects/not-mine", "runs/00000000-0000-0000-0000-000000000000", "runs/00000000-0000-0000-0000-000000000000/events"]) {
    expect((await request.get(`/api/agent/${path}`)).status()).toBe(401);
  }
});

test("project and run access stays scoped to the signed-in workspace", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await signIn(page);
  const headers = { Origin: "http://localhost:3010" };
  const projectResponse = await page.request.post("/api/workspace/items", { headers, multipart: { kind: "projects", title: "Private project" } });
  expect(projectResponse.status()).toBe(201);
  const { item: project } = await projectResponse.json();
  const requestId = crypto.randomUUID();
  const issueInput = { headers, multipart: { kind: "issues", title: "Private issue", projectId: project.id, requestId } };
  const [first, duplicate] = await Promise.all([page.request.post("/api/workspace/items", issueInput), page.request.post("/api/workspace/items", issueInput)]);
  expect(first.status()).toBe(201); expect(duplicate.status()).toBe(201);
  const { item: issue } = await first.json();
  expect((await duplicate.json()).item.runId).toBe(issue.runId);
  const detail = await (await page.request.get(`/api/agent/projects/${project.id}`)).json();
  expect(detail.issues).toHaveLength(1); expect(detail.runs).toHaveLength(1);
  const other = await browser.newContext();
  try {
    const stranger = await other.newPage(); await signIn(stranger);
    for (const path of [`projects/${project.id}`, `runs/${issue.runId}`, `runs/${issue.runId}/events`]) expect((await stranger.request.get(`/api/agent/${path}`)).status()).toBe(404);
    const forbidden = await stranger.request.post("/api/workspace/items", { headers, multipart: { kind: "issues", title: "Foreign issue", projectId: project.id } });
    expect(forbidden.status()).toBe(404);
    const badOrigin = await page.request.put("/api/agent/settings", { headers: { Origin: "https://attacker.example" }, multipart: { prompt: "changed", instructions: "changed" } });
    expect(badOrigin.status()).toBe(403);
  } finally { await other.close(); }
});
