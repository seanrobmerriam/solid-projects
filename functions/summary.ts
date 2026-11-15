import { Pool } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { attachDatabasePool } from "@neon/functions";

let pool: Pool | undefined;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function database() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Database is not configured");
    pool = new Pool({ connectionString: url.replace("sslmode=require", "sslmode=verify-full"), max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
    attachDatabasePool(pool);
    pool.on("error", () => console.error("Summary database connection closed"));
  }
  return pool;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    let userId: string;
    try {
      if (!process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) throw new Error("Auth is not configured");
      jwks ??= createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
      const { payload } = await jwtVerify(bearer.slice(7), jwks, {
        issuer: new URL(process.env.NEON_AUTH_BASE_URL).origin, algorithms: ["EdDSA"]
      });
      if (!payload.sub || !payload.exp) throw new Error("Invalid user token");
      userId = payload.sub;
    } catch { return Response.json({ error: "Unauthorized" }, { status: 401, headers }); }
    try {
      const { rows } = await database().query(
        `SELECT count(*) FILTER (WHERE i.kind = 'projects')::int AS projects,
          count(*) FILTER (WHERE i.kind = 'issues')::int AS issues,
          count(*) FILTER (WHERE i.kind = 'documents')::int AS documents,
          count(*) FILTER (WHERE i.storage_key IS NOT NULL)::int AS files
         FROM workspace_items i JOIN workspace_members m ON m.workspace_id = i.workspace_id
         WHERE m.user_id = $1`, [userId]);
      return Response.json(rows[0], { headers });
    } catch {
      console.error("Workspace summary query failed");
      return Response.json({ error: "Summary temporarily unavailable" }, { status: 503, headers });
    }
  }
};
