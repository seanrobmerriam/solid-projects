// start-oauth 1.3 ships implementation .ts files as its type entry point.
// These public signatures avoid type-checking an unrelated GitHub provider
// that has implicit-any errors, while preserving strict checks in our app.
declare module "start-oauth" {
  import type { CustomResponse } from "@solidjs/router";
  import type { APIEvent } from "@solidjs/start/server";

  type Provider = "amazon" | "discord" | "github" | "google" | "linkedin" | "microsoft" | "spotify" | "x" | "yahoo";
  interface OAuthUser {
    name: string;
    email: string;
    image?: string;
    oauth: { provider: Provider; token: string };
  }
  type Configuration = Partial<Record<Provider, { id: string; secret: string }>> & {
    password: string;
    handler: (user: OAuthUser, redirectTo?: string) => Promise<CustomResponse<never>>;
  };

  export default function OAuth(config: Configuration): (event: APIEvent) => Promise<Response>;
  export function useOAuthLogin(): (provider: Provider) => string;
}
