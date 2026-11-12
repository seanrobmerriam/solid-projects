import { action, query, redirect } from "@solidjs/router";
import { getSession, passwordLogin } from "./server";

// Define routes that require being logged in
const PROTECTED_ROUTES = ["/", "/dashboard"];

const isProtected = (path: string) =>
  PROTECTED_ROUTES.some(route =>
    route.endsWith("/*")
      ? path.startsWith(route.slice(0, -2))
      : path === route || path.startsWith(route + "/")
  );

export const querySession = query(async (pathname: string) => {
  "use server";
  const path = pathname.replace(/\/+$/, "") || "/";
  const isSignIn = path === "/login" || path === "/dashboard";
  const { data } = await getSession();
  if (isSignIn && data.id) throw redirect("/dashboard/views/overview");
  if (data.id) return { id: data.id, email: data.email ?? "" };
  if (!isSignIn && isProtected(path)) {
    throw redirect(path.startsWith("/dashboard/") ? "/dashboard" : "/login");
  }
  return null;
}, "session");

export const formLogin = action(async (formData: FormData) => {
  "use server";
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string")
    return new Error("Email and password are required");
  return await passwordLogin(email.trim().toLowerCase(), password);
});

export const logout = action(async () => {
  "use server";
  const session = await getSession();
  await session.update({ id: undefined });
  throw redirect("/dashboard", { revalidate: "session" });
});
