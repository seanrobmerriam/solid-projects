import { createAuthServer, extractNeonAuthCookies, serializeSetCookie } from "@neondatabase/auth/server";
import { getRequestEvent } from "solid-js/web";
import { appOrigin } from "~/server/origin";

export interface Session { id: string; email: string }

export function authConfig() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !cookieSecret || cookieSecret.length < 32) {
    throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET.");
  }
  return { baseUrl, cookieSecret, sessionDataTtl: 30, sameSite: "lax" as const };
}

export function getAuth(request?: Request) {
  return createAuthServer({
    ...authConfig(),
    context: () => {
      const event = getRequestEvent();
      const current = request ?? event?.request;
      if (!current) throw new Error("Authentication requires a request");
      return {
        getCookies: () => extractNeonAuthCookies(current.headers.get("cookie") ?? ""),
        getHeader: name => current.headers.get(name),
        getOrigin: () => current.headers.get("origin") ?? appOrigin(current),
        getFramework: () => "solid-start",
        setCookie: (name, value, options) => {
          if (!event) throw new Error("Authentication cookies require an active server response");
          event.response.headers.append("Set-Cookie", serializeSetCookie({ name, value, ...options }));
        }
      };
    }
  });
}

export async function getSession(request?: Request): Promise<Session | null> {
  if (!process.env.NEON_AUTH_BASE_URL) return null;
  const { data, error } = await getAuth(request).getSession();
  if (error) throw new Error("Unable to verify your session. Please try again.");
  return data?.user ? { id: data.user.id, email: data.user.email } : null;
}

export async function requireUser(request?: Request): Promise<Session> {
  const user = await getSession(request);
  if (!user) throw new Response(JSON.stringify({ error: "Sign in to continue" }), {
    status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
  return user;
}
