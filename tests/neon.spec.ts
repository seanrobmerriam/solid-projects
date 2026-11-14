import { expect, test } from "@playwright/test";
import { functionBaseUrl } from "@neon/env";
import { signIn, testPassword } from "./helpers/auth";

test("Neon Auth creates accounts, restores sessions, signs out and rejects anonymous APIs", async ({ page, request }) => {
  for (const path of ["/api/workspace", "/api/workspace/live", "/api/workspace/summary", "/api/workspace/documents/unknown/file"]) {
    expect((await request.get(path)).status()).toBe(401);
  }
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Create a new account" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Neon account test");
  await page.getByLabel("Email", { exact: true }).fill(`neon-ui-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/views\/overview$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
});

test("Postgres persistence, cross-client realtime, private file bytes and Function counts work together", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page);
  await expect(page.locator(".workspace-footer")).toContainText("Live updates connected", { timeout: 20_000 });
  const second = await browser.newContext({ storageState: await page.context().storageState() });
  const other = await browser.newContext();
  try {
    const mirror = await second.newPage();
    await mirror.goto("/dashboard/views/projects");
    await expect(mirror.locator(".workspace-footer")).toContainText("Live updates connected", { timeout: 20_000 });
    const workspace = await (await page.request.get("/api/workspace")).json();
    const title = `Live persisted project ${crypto.randomUUID()}`;
    const origin = { Origin: "http://localhost:3010", "x-workspace-user": workspace.userId };
    const creation = await page.request.post("/api/workspace/items", {
      headers: origin, multipart: { kind: "projects", title, description: "Saved in Postgres, delivered by Neon Realtime" }
    });
    expect(creation.status()).toBe(201);
    expect((await creation.json()).txid).toBeTruthy();
    await expect(mirror.getByRole("option", { name: new RegExp(title) })).toBeVisible({ timeout: 15_000 });
    await mirror.reload();
    await expect(mirror.getByRole("option", { name: new RegExp(title) })).toBeVisible();

    await page.goto("/dashboard/views/documents");
    await expect(page.locator(".workspace-footer")).toContainText("Live updates connected");
    const documentTitle = `Private document ${crypto.randomUUID()}`;
    const bytes = Buffer.from("Neon object storage round trip — exact bytes\n");
    await page.getByRole("button", { name: "+ Document", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(documentTitle);
    await dialog.getByLabel("File", { exact: false }).setInputFiles({ name: "round-trip.txt", mimeType: "text/plain", buffer: bytes });
    await dialog.getByRole("button", { name: "Create document", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 20_000 });
    await page.getByRole("option", { name: new RegExp(documentTitle) }).click();
    const download = dialog.getByRole("link", { name: "Download file" });
    const path = await download.getAttribute("href");
    expect(path).toBeTruthy();
    const file = await page.request.get(path!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-disposition"]).toContain("attachment");
    expect(await file.body()).toEqual(bytes);
    await page.screenshot({ path: "test-results/neon-desktop.png", fullPage: true });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "+ Document", exact: true }).click();
    await page.screenshot({ path: "test-results/neon-mobile-upload.png", fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");

    const summary = await page.request.get("/api/workspace/summary");
    expect(summary.status()).toBe(200);
    expect(await summary.json()).toEqual({ projects: 13, issues: 36, documents: 51, files: 1 });
    expect((await page.request.get(functionBaseUrl("summary"))).status()).toBe(401);

    const stranger = await other.newPage();
    await signIn(stranger);
    expect((await stranger.request.get(path!)).status()).toBe(404);
    const strangerWorkspace = await (await stranger.request.get("/api/workspace")).json();
    expect(strangerWorkspace.collections.projects.some((item: { title: string }) => item.title === title)).toBe(false);
    expect(strangerWorkspace.userId).not.toBe(workspace.userId);
    const forged = await page.request.post("/api/workspace/items", { headers: { Origin: "https://attacker.example" }, multipart: { kind: "projects", title: "forged" } });
    expect(forged.status()).toBe(403);
    const stale = await page.request.get("/api/workspace/live", { headers: { "x-workspace-user": strangerWorkspace.userId } });
    expect(stale.status()).toBe(409);
  } finally { await second.close(); await other.close(); }
});

test("Realtime renews capabilities beyond their original lifetime", async ({ page }) => {
  test.setTimeout(100_000);
  await signIn(page);
  await expect(page.locator(".workspace-footer")).toContainText("Live updates connected", { timeout: 20_000 });
  const workspace = await (await page.request.get("/api/workspace")).json();
  // Capabilities expire after 60 seconds. This checks a real renewal, rather
  // than only observing an initial subscription or advancing a local clock.
  await page.waitForTimeout(65_000);
  const title = `After renewal ${crypto.randomUUID()}`;
  const response = await page.request.post("/api/workspace/items", { headers: { Origin: "http://localhost:3010", "x-workspace-user": workspace.userId }, multipart: { kind: "projects", title } });
  expect(response.status()).toBe(201);
  await expect(page.getByRole("option", { name: new RegExp(title) })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".workspace-footer")).toContainText("Live updates connected");
});
