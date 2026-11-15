import { expect, request, type Page } from "@playwright/test";

export const testPassword = "dashboard-e2e-password-2026";
const emails = new WeakMap<Page, string>();

export async function accountEmail(page: Page) {
  let email = emails.get(page);
  if (email) return email;
  email = `workspace-e2e-${crypto.randomUUID()}@example.test`;
  const api = await request.newContext({ baseURL: "http://localhost:3010", extraHTTPHeaders: { Origin: "http://localhost:3010" } });
  try {
    const response = await api.post("/api/auth/sign-up/email", { data: { name: "Workspace test", email, password: testPassword } });
    expect(response.ok(), `Test account sign-up failed (${response.status()})`).toBe(true);
  } finally { await api.dispose(); }
  emails.set(page, email);
  return email;
}

export async function signIn(page: Page) {
  const email = await accountEmail(page);
  await page.goto("/dashboard");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/views\/overview$/);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("listbox", { name: "All Projects" }).getByRole("option")).toHaveCount(12, { timeout: 15_000 });
}
