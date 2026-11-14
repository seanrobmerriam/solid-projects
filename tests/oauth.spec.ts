import { expect, test } from "@playwright/test";

test("GitHub sign-in waits for hydration before accepting clicks", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/dashboard`);
  await expect(page.getByRole("button", { name: "Sign in with GitHub", exact: true })).toBeDisabled();
  await context.close();
});

test("GitHub sign-in navigates to the OAuth URL with the current callback origin", async ({ page, baseURL }) => {
  let callbackURL: string | undefined;
  await page.route("**/api/auth/sign-in/social", async route => {
    callbackURL = route.request().postDataJSON().callbackURL;
    await route.fulfill({ json: { url: `${baseURL}/oauth-test-destination`, redirect: true } });
  });
  await page.route("**/oauth-test-destination", route => route.fulfill({ body: "OAuth navigation confirmed" }));
  await page.goto("/dashboard");
  const button = page.getByRole("button", { name: "Sign in with GitHub", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(`${baseURL}/oauth-test-destination`);
  expect(callbackURL).toBe(`${baseURL}/auth/callback`);
});
