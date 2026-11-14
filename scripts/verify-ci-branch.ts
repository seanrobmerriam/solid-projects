import { Client } from "pg";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { databaseConfig } from "../src/server/db";

export function validateCiTarget(expected: string | undefined, env: Record<string, string | undefined>) {
  if (!expected || !/^ci-[1-9]\d*-[1-9]\d*$/.test(expected) || env.NEON_BRANCH !== expected) {
    throw new Error("CI verification requires the matching disposable branch name");
  }
  if (!/^br-[a-z0-9-]+$/.test(env.NEON_BRANCH_ID ?? "")) throw new Error("CI verification requires a branch ID");
  const connection = env.DATABASE_URL_UNPOOLED;
  if (!connection || new URL(connection).hostname.includes("-pooler")) throw new Error("CI verification requires a direct database URL");
  return databaseConfig(connection);
}

interface QueryClient { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
export async function verifyEmptyDatabase(client: QueryClient) {
  const users = await client.query('SELECT EXISTS (SELECT 1 FROM neon_auth."user" LIMIT 1) AS occupied');
  if (users.rows[0]?.occupied !== false) throw new Error("CI template contains Auth users; refusing integration tests");
  for (const table of ["workspaces", "workspace_items"]) {
    const exists = await client.query("SELECT to_regclass($1) AS relation", ["public." + table]);
    if (exists.rows[0]?.relation) {
      const rows = await client.query("SELECT EXISTS (SELECT 1 FROM " + table + " LIMIT 1) AS occupied");
      if (rows.rows[0]?.occupied !== false) throw new Error("CI template contains workspace data; refusing integration tests");
    }
  }
}

if (import.meta.main) {
  let client: Client | undefined;
  const storage = new S3Client({ forcePathStyle: true });
  try {
    client = new Client(validateCiTarget(Bun.argv[2], process.env));
    await client.connect();
    await verifyEmptyDatabase(client);
    const objects = await storage.send(new ListObjectsV2Command({ Bucket: "documents", MaxKeys: 1 }));
    if (objects.Contents?.length) throw new Error("CI template contains files; refusing integration tests");
    console.log("CI branch Auth, workspace tables and private documents bucket are empty");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error(message.startsWith("CI ") ? message : "CI isolation verification failed; no credentials were printed");
    process.exitCode = 1;
  } finally { await client?.end(); storage.destroy(); }
}
