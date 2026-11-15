import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { databaseConfig } from "../src/server/db";

const connection = process.env.DATABASE_URL_UNPOOLED;
// Migrations are explicit, transactional, and checksum-verified. CI runs this
// sequence on an isolated clone of the empty CI template.
if (!connection) throw new Error("DATABASE_URL_UNPOOLED is required for explicit migrations");
if (new URL(connection).hostname.includes("-pooler")) throw new Error("Migrations require a direct database connection");
const pool = new Pool({ ...databaseConfig(connection), max: 1 });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(731847291)");
  await client.query("CREATE TABLE IF NOT EXISTS workspace_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const name of (await readdir(new URL("../migrations/", import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = await client.query<{ checksum: string }>("SELECT checksum FROM workspace_migrations WHERE name=$1", [name]);
    if (previous.rows[0]) {
      if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO workspace_migrations(name,checksum) VALUES ($1,$2)", [name, checksum]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(731847291)").catch(() => {});
  client.release();
  await pool.end();
}
