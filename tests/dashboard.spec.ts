import { expect, test, type Page } from "@playwright/test";
import { signIn, accountEmail, testPassword } from "./helpers/auth";

test("sign-in offers managed Neon email and GitHub authentication", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a new account" })).toBeVisible();
});

test("dark mode follows system preference, persists, and fits the mobile toolbar", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page);
  const toggle = page.getByRole("button", { name: "Dark mode", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".dashboard-main")).toHaveCSS("background-color", "rgb(24, 29, 41)");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "/tmp/workspace-dark-desktop.png" });
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "New project", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(24, 29, 41)");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).toHaveCSS("transform", "matrix(1, 0, 0, 1, -250, 0)");
  await expect(toggle).toBeVisible();
  const combo = await page.locator(".view-combobox").boundingBox();
  const button = await toggle.boundingBox();
  expect(button!.x).toBeGreaterThanOrEqual(combo!.x + combo!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/workspace-dark-mobile.png" });
  await toggle.click();
  await page.screenshot({ path: "/tmp/workspace-light-mobile.png" });
});

test("all dashboard views require an existing auth session", async ({ page }) => {
  for (const view of ["overview", "projects", "issues", "documents"]) {
    await page.goto(`/dashboard/views/${view}`);
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCount(0);
  }
});

test("login opens Overview, filtering and every navigation control preserve the shell", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("listbox")).toHaveCount(2);
  const sidebar = page.getByRole("navigation", { name: "Workspace" });
  await sidebar.evaluate(element => element.setAttribute("data-mounted-test", "true"));

  await page.getByLabel("Filter projects").fill("  ATLAS  ");
  await expect(page.getByRole("listbox", { name: "All Projects" }).getByRole("option")).toHaveCount(1);
  await page.getByLabel("Filter projects").fill("no-such-project");
  await expect(page.getByText("No projects found")).toBeVisible();
  await page.getByLabel("Filter projects").clear();

  await sidebar.getByRole("menuitem", { name: /^Projects/ }).click();
  await expect(page).toHaveURL(/\/views\/projects$/);
  await expect(sidebar).toHaveAttribute("data-mounted-test", "true");
  await expect(page.getByRole("heading", { name: "All Projects", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Views", exact: true }).click();
  await page.getByRole("menuitem", { name: "Issues", exact: true }).click();
  await expect(page).toHaveURL(/\/views\/issues$/);

  await page.getByRole("combobox", { name: "Current view" }).fill("Doc");
  await page.getByRole("option", { name: "Documents", exact: true }).click();
  await expect(page).toHaveURL(/\/views\/documents$/);
  await expect(sidebar).toHaveAttribute("data-mounted-test", "true");
  await expect(page.getByRole("listbox", { name: "All Documents" }).getByRole("option")).toHaveCount(50);

  await page.getByLabel("Filter documents").fill("architecture");
  await expect(page.getByRole("listbox", { name: "All Documents" }).getByRole("option")).not.toHaveCount(0);
  await page.getByLabel("Filter documents").fill("no-such-document");
  await expect(page.getByText("No documents found")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("listbox", { name: "All Documents" }).getByRole("option")).toHaveCount(50);

  await page.reload();
  await expect(page).toHaveURL(/\/views\/documents$/);
  await expect(page.getByRole("heading", { name: "All Documents", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await page.goto("/dashboard/views/documents");
  await expect(page).toHaveURL(/\/dashboard\/?$/);
});

test("mock creation, record details, sidebar children and mobile navigation work", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Customer analytics launch");
  await dialog.getByRole("textbox", { name: /^Description/ }).fill("Coordinate the next analytics release.");
  await dialog.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Filter projects").fill("Customer analytics launch");
  await page.getByRole("option", { name: /Customer analytics launch/ }).click();
  await expect(dialog.getByRole("heading", { name: "Customer analytics launch" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("navigation", { name: "Workspace" }).getByRole("menuitem", { name: /^Projects/ }).click();
  await page.getByRole("button", { name: "Expand Projects" }).click();
  await expect(page.getByRole("menuitem", { name: /Customer analytics launch/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Customer analytics launch/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("menuitem", { name: /^Documents/ }).click();
  await expect(page).toHaveURL(/\/views\/documents$/);
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("page titles follow the view and the browser reports no runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await signIn(page);
  await expect(page).toHaveTitle("Overview · Workspace");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("menuitem", { name: /^Documents/ }).click();
  await expect(page).toHaveTitle("All Documents · Workspace");
  await page.goBack();
  await expect(page).toHaveTitle("Overview · Workspace");
  await expect(page.getByRole("combobox", { name: "Current view" })).toHaveValue("Overview");
  await page.goForward();
  await expect(page.getByRole("combobox", { name: "Current view" })).toHaveValue("Documents");
  expect(errors).toEqual([]);
});

test("collection buttons create records, and listboxes open details with the keyboard", async ({ page }) => {
  await signIn(page);
  for (const [view, label] of [["projects", "Project"], ["issues", "Issue"], ["documents", "Document"]] as const) {
    await page.getByRole("button", { name: "Views", exact: true }).click();
    await page.getByRole("menuitem", { name: label === "Issue" ? "Issues" : `${label}s`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/views/${view}$`));
    const list = page.getByRole("listbox", { name: `All ${label === "Issue" ? "Issues" : `${label}s`}` });
    await expect(list).toBeVisible();
    const initialCount = await list.getByRole("option").count();
    await page.getByRole("button", { name: `+ ${label}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(`New ${label} for keyboard check`);
    await dialog.getByRole("button", { name: `Create ${label.toLowerCase()}`, exact: true }).click();
    await expect(list.getByRole("option")).toHaveCount(initialCount + 1);
    await page.getByLabel(`Filter ${view}`).fill(`New ${label} for keyboard check`);
    await expect(list.getByRole("option")).toHaveCount(1);
    await list.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: `New ${label} for keyboard check` })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("legacy login works and invalid passwords show an accessible error", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(await accountEmail(page));
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid email or password");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(await accountEmail(page));
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/views\/overview$/);
  await page.goto("/dashboard/");
  await expect(page).toHaveURL(/\/views\/overview$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard\/views\/overview$/);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
});
