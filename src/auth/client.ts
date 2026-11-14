import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";

function createBrowserAuth() {
  return createAuthClient(new URL("/api/auth", window.location.origin).href, { adapter: BetterAuthVanillaAdapter() });
}
let client: ReturnType<typeof createBrowserAuth> | undefined;
export function getAuthClient() {
  if (typeof window === "undefined") throw new Error("Auth client is browser-only");
  return client ??= createBrowserAuth();
}
