import OAuth from "start-oauth";
import type { APIEvent } from "@solidjs/start/server";
import { createUser, findUser } from "~/auth/db";
import { createSession } from "~/auth/server";

const handleOAuth = OAuth({
  password: process.env.SESSION_SECRET!,
  discord: {
    id: process.env.DISCORD_ID!,
    secret: process.env.DISCORD_SECRET!
  },
  async handler({ email }, redirectTo) {
    let user = await findUser({ email });
    if (!user) user = await createUser({ email });
    return createSession(user, redirectTo);
  }
});

export function GET(event: APIEvent) {
  // TLS may terminate at a reverse proxy, leaving an HTTP request URL here.
  // Use the same public origin for authorization and the token exchange.
  const origin = process.env.OAUTH_ORIGIN;
  if (!origin) return handleOAuth(event);
  const publicOrigin = new URL(origin);
  const url = new URL(event.request.url);
  url.protocol = publicOrigin.protocol;
  url.host = publicOrigin.host;
  url.port = publicOrigin.port;
  return handleOAuth({ ...event, request: new Request(url, event.request) });
}
