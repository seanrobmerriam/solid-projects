import { action, query, redirect } from "@solidjs/router";
import { getAuth, getSession } from "./server";

export const querySession = query(async (pathname: string) => {
  "use server";
  const path = pathname.replace(/\/+$/, "") || "/";
  const signIn = path === "/login" || path === "/dashboard";
  const session = await getSession();
  if (session && (path === "/" || signIn)) throw redirect("/dashboard/views/overview");
  if (!session && path.startsWith("/dashboard/")) throw redirect("/dashboard");
  if (!session && path === "/") throw redirect("/login");
  return session;
}, "session");

function credentials(data: FormData) {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const password = String(data.get("password") ?? "");
  if (!email || !email.includes("@") || password.length < 8 || password.length > 128) {
    throw new Error("Enter a valid email and a password between 8 and 128 characters.");
  }
  return { email, password };
}

export const formLogin = action(async (data: FormData) => {
  "use server";
  const result = await getAuth().signIn.email(credentials(data));
  if (result.error) throw new Error("Invalid email or password, or your email needs verification.");
  return redirect("/dashboard/views/overview", { revalidate: "session" });
});

export const formSignup = action(async (data: FormData) => {
  "use server";
  const name = String(data.get("name") ?? "").trim();
  if (!name || name.length > 100) throw new Error("Enter your name (up to 100 characters).");
  const result = await getAuth().signUp.email({ ...credentials(data), name });
  if (result.error) throw new Error(result.error.message || "Unable to create your account.");
  if (!result.data?.token) throw new Error("Check your email to verify your account, then sign in.");
  return redirect("/dashboard/views/overview", { revalidate: "session" });
});

export const logout = action(async () => {
  "use server";
  const result = await getAuth().signOut();
  if (result.error) throw new Error("Unable to sign out. Please try again.");
  return redirect("/dashboard", { revalidate: "session" });
});
