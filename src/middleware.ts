import { createMiddleware } from "@solidjs/start/middleware";
import { processAuthMiddleware } from "@neondatabase/auth/server";
import { authConfig } from "./auth/server";

export default createMiddleware({
  async onRequest(event) {
    const url = new URL(event.request.url);
    if (url.pathname !== "/auth/callback") return;
    const result = await processAuthMiddleware({
      ...authConfig(), request: event.request, pathname: url.pathname,
      skipRoutes: ["/auth/callback"], loginUrl: "/dashboard"
    });
    const destination = result.action === "allow"
      ? new URL("/dashboard/views/overview", process.env.APP_ORIGIN ?? url.origin).toString()
      : result.redirectUrl.toString();
    const headers = new Headers({ Location: destination, "Cache-Control": "no-store" });
    for (const cookie of result.cookies ?? []) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 302, headers });
  }
});
