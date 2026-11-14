import { handleAuthProxyRequest } from "@neondatabase/auth/server";
import type { APIEvent } from "@solidjs/start/server";
import { authConfig } from "~/auth/server";

async function handle(event: APIEvent) {
  const response = await handleAuthProxyRequest({ ...authConfig(), request: event.request, path: event.params.path });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
