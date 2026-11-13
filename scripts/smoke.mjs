import { spawn } from "bun";

const port = "3011";
const server = spawn(["bun", ".output/server/index.mjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production", HOST: "127.0.0.1", PORT: port,
    SESSION_SECRET: "ci-only-session-secret-not-for-production-1234567890",
    DISCORD_ID: "ci-discord-client", DISCORD_SECRET: "ci-discord-secret"
  },
  stdout: "inherit", stderr: "inherit"
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Built server exited before becoming healthy");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(2000), redirect: "error"
      });
      if (response.ok && (await response.json()).status === "ok") {
        ready = true;
        break;
      }
    } catch {}
    await Bun.sleep(500);
  }
  if (!ready) throw new Error("Built server did not become healthy");
  const page = await fetch(`http://127.0.0.1:${port}/dashboard`, { redirect: "error" });
  if (!page.ok || !(await page.text()).includes("Sign in")) {
    throw new Error("Built server did not render the sign-in page");
  }
  const protectedPage = await fetch(`http://127.0.0.1:${port}/dashboard/views/overview`, {
    redirect: "manual"
  });
  if (![302, 303, 307, 308].includes(protectedPage.status) ||
      !new URL(protectedPage.headers.get("location"), `http://127.0.0.1:${port}`).pathname.match(/^\/dashboard\/?$/)) {
    throw new Error("Built server did not protect the dashboard");
  }
  console.log("Built-server health, SSR sign-in and route protection passed");
} finally {
  server.kill();
  await server.exited;
}
