import { Pool, type PoolConfig } from "pg";

// Strip pg's SSL URL switches: they otherwise override rejectUnauthorized.
export function databaseConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database protocol");
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 8,
    connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, statement_timeout: 15_000 };
}
let pool: Pool | undefined;
export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
    pool = new Pool(databaseConfig(process.env.DATABASE_URL));
    pool.on("error", () => console.error("An idle workspace database connection failed"));
  }
  return pool;
}
