import { createRealtime, rawSql } from "@neon/realtime/server";
import type { CollectionKind, WorkspaceItem } from "~/components/dashboard/data";
export interface WorkspaceRow {
  workspace_id: string;
  id: string;
  kind: CollectionKind;
  data: WorkspaceItem;
}
export const WORKSPACE_LIVE_SQL = `SELECT i.workspace_id, i.id, i.kind, i.data FROM workspace_items i
JOIN workspace_members m ON m.workspace_id = i.workspace_id
WHERE m.user_id = $1 AND i.workspace_id = $2 ORDER BY i.created_at DESC, i.id`;
export async function sealWorkspace(userId: string, workspaceId: string) {
  const { NEON_REALTIME_SECRET: secret, NEON_REALTIME_URL: url, DATABASE_URL: databaseUrl } = process.env;
  if (!secret || !url || !databaseUrl) throw new Error("Live updates are not configured");
  const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  const realtime = createRealtime({ secret, db });
  return { url, sealedQuery: await realtime.seal({ query: rawSql<WorkspaceRow>(WORKSPACE_LIVE_SQL, [userId, workspaceId]) }) };
}
