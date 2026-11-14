import { initialCollections, type SavedCollectionKind as CollectionKind, type WorkspaceItem } from "~/components/dashboard/data";
import { ensureProjectDirectory, removeNewProjectDirectory } from "./agents/files";
import { getPool } from "./db";
import { appOrigin } from "./origin";
import { MAX_FILE_BYTES, uploadDocument, deleteDocument } from "./storage";
import type { WorkspaceRow } from "./realtime";

export class WorkspaceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function verifyPageUser(request: Request, userId: string) {
  const expected = request.headers.get("x-workspace-user");
  if (expected !== null && expected !== userId) throw new WorkspaceError(409, "Your session changed. Reload this page.");
}
export function verifyMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_ORIGIN;
  if (!configured || !origin || origin !== appOrigin(request, configured)) {
    throw new WorkspaceError(403, "Request origin is not allowed");
  }
}
export async function readCreationForm(request: Request, max = MAX_FILE_BYTES + 64 * 1024) {
  if (Number(request.headers.get("content-length")) > max) throw new WorkspaceError(413, "Upload is too large");
  if (!request.body) throw new WorkspaceError(400, "Send a multipart form");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new WorkspaceError(413, "Upload is too large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
  } catch { throw new WorkspaceError(400, "Send a multipart form"); }
}
export function validateCreation(form: FormData) {
  const kind = form.get("kind");
  if (kind !== "projects" && kind !== "issues" && kind !== "documents") throw new WorkspaceError(400, "Choose a valid collection");
  const title = form.get("title");
  const description = form.get("description") ?? "";
  if (typeof title !== "string" || !title.trim() || title.trim().length > 160) throw new WorkspaceError(400, "Title must contain 1–160 characters");
  if (typeof description !== "string" || description.trim().length > 2000) throw new WorkspaceError(400, "Description must contain at most 2000 characters");
  const value = form.get("file");
  if (value !== null && !(value instanceof File)) throw new WorkspaceError(400, "Invalid file");
  const file = value instanceof File && value.name ? value : undefined;
  if (file && (kind !== "documents" || file.size > MAX_FILE_BYTES)) throw new WorkspaceError(400, "Only documents accept files, up to 10 MiB");
  return { kind, title: title.trim(), description: description.trim(), file };
}

// The winning INSERT seeds inside the same transaction. Concurrent first requests
// wait on owner_id's unique constraint and never observe a partially seeded account.
export async function ensureWorkspace(userId: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ id: string }>("INSERT INTO workspaces(id,owner_id) VALUES ($1,$2) ON CONFLICT(owner_id) DO NOTHING RETURNING id", [crypto.randomUUID(), userId]);
    let id = created.rows[0]?.id;
    if (id) {
      await client.query("INSERT INTO workspace_members(workspace_id,user_id) VALUES ($1,$2)", [id, userId]);
      const seed = Object.entries(initialCollections).flatMap(([kind, items]) => items.map(data => ({ kind, data })));
      await client.query(`INSERT INTO workspace_items(workspace_id,id,kind,data)
        SELECT $1::uuid, entry->'data'->>'id', entry->>'kind', entry->'data' FROM jsonb_array_elements($2::jsonb) entry`, [id, JSON.stringify(seed)]);
    } else {
      id = (await client.query<{ id: string }>("SELECT w.id FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE w.owner_id=$1 AND m.user_id=$1", [userId])).rows[0]?.id;
    }
    if (!id) throw new WorkspaceError(403, "Workspace access is unavailable");
    await client.query("COMMIT");
    return id;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function readCollections(userId: string, workspaceId: string) {
  const result = await getPool().query<WorkspaceRow>(`SELECT i.workspace_id,i.id,i.kind,i.data FROM workspace_items i
    JOIN workspace_members m ON m.workspace_id=i.workspace_id WHERE m.user_id=$1 AND i.workspace_id=$2 ORDER BY i.created_at DESC,i.id`, [userId, workspaceId]);
  const collections: Record<CollectionKind, WorkspaceItem[]> = { projects: [], issues: [], documents: [], tasks: [] };
  for (const row of result.rows) collections[row.kind].push(row.data);
  return collections;
}
export async function createItem(user: { id: string; email: string }, workspaceId: string, form: FormData) {
  const { kind, title, description, file } = validateCreation(form);
  const requestId = form.get("requestId");
  if (requestId !== null && (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId))) throw new WorkspaceError(400, "Invalid submission ID");
  const id = `${kind}-${requestId || crypto.randomUUID()}`;
  const existing = await getPool().query<{ data: WorkspaceItem }>("SELECT data FROM workspace_items WHERE workspace_id=$1 AND id=$2", [workspaceId, id]);
  if (existing.rows[0]) return { item: existing.rows[0].data };
  const projectId = form.get("projectId");
  if (kind === "issues") {
    if (typeof projectId !== "string") throw new WorkspaceError(400, "Choose a project for this issue");
    const project = await getPool().query("SELECT id FROM workspace_items WHERE workspace_id=$1 AND id=$2 AND kind='projects'", [workspaceId, projectId]);
    if (!project.rows.length) throw new WorkspaceError(404, "Project not found");
  }
  const date = new Date().toISOString().slice(0, 10);
  const item: WorkspaceItem = {
    id, title, description, owner: user.email,
    status: kind === "projects" ? "Planning" : kind === "issues" ? "Open" : "Draft", updatedAt: date, tags: [],
    ...(kind === "projects" ? { progress: 0, code: "NEW" } : {}),
    ...(kind === "issues" ? { priority: "Medium", code: "NEW", projectId: String(projectId), runId: crypto.randomUUID() } : {}),
    ...(kind === "documents" ? { fileType: file ? (file.name.split(".").at(-1) || "FILE").slice(0, 12).toUpperCase() : "MD", size: file?.size ?? new TextEncoder().encode(description).length, version: "1.0", createdAt: date } : {}),
  };
  let uploaded: Awaited<ReturnType<typeof uploadDocument>> | undefined;
  const client = await getPool().connect();
  let directory: string | undefined;
  let committed = false;
  let commitAttempted = false;
  try {
    await client.query("BEGIN");
    // Serialize repeated submissions before allocating a folder or run.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [workspaceId + id]);
    const repeated = await client.query<{ data: WorkspaceItem }>("SELECT data FROM workspace_items WHERE workspace_id=$1 AND id=$2", [workspaceId, id]);
    if (repeated.rows[0]) { await client.query("COMMIT"); committed = true; return { item: repeated.rows[0].data }; }
    if (kind === "projects") { directory = await ensureProjectDirectory(workspaceId, id); item.projectDirectory = directory; }
    if (file) { uploaded = await uploadDocument(workspaceId, file); Object.assign(item, { hasFile: true, filename: uploaded.filename }); }
    const result = await client.query<{ txid: string }>(`INSERT INTO workspace_items(workspace_id,id,kind,data,storage_key,filename,content_type)
      SELECT m.workspace_id,$3,$4,$5::jsonb,$6,$7,$8 FROM workspace_members m WHERE m.user_id=$1 AND m.workspace_id=$2
      RETURNING pg_current_xact_id()::text AS txid`, [user.id, workspaceId, item.id, kind, JSON.stringify(item), uploaded?.key ?? null, uploaded?.filename ?? null, uploaded?.contentType ?? null]);
    if (!result.rows[0]) throw new WorkspaceError(403, "Workspace access is unavailable");
    if (kind === "issues") await client.query("INSERT INTO agent_runs(id,workspace_id,project_id,issue_id,status) VALUES($1,$2,$3,$4,'Queued')", [item.runId, workspaceId, projectId, item.id]);
    commitAttempted = true;
    await client.query("COMMIT"); committed = true;
    return { item, txid: result.rows[0].txid };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    if (directory && !committed && !commitAttempted) await removeNewProjectDirectory(directory).catch(() => console.error("Project folder cleanup failed"));
    if (uploaded && !commitAttempted) await deleteDocument(uploaded.key).catch(() => console.error("Document upload compensation failed"));
    throw error;
  } finally { client.release(); }
}
export async function findDocument(userId: string, id: string) {
  const result = await getPool().query<{ storage_key: string | null; filename: string | null }>(`SELECT i.storage_key,i.filename FROM workspace_items i
    JOIN workspace_members m ON m.workspace_id=i.workspace_id WHERE m.user_id=$1 AND i.id=$2 AND i.kind='documents'`, [userId, id]);
  const document = result.rows[0];
  if (!document?.storage_key || !document.filename) throw new WorkspaceError(404, "File not found");
  return document;
}
export async function removeItem(userId: string, workspaceId: string, id: string) {
  // Hold the row while deleting its private object; failure leaves a retryable row.
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ storage_key: string | null }>(`SELECT i.storage_key FROM workspace_items i JOIN workspace_members m ON m.workspace_id=i.workspace_id
      WHERE m.user_id=$1 AND i.workspace_id=$2 AND i.id=$3 FOR UPDATE OF i`, [userId, workspaceId, id]);
    if (!found.rows[0]) throw new WorkspaceError(404, "Item not found");
    if (found.rows[0].storage_key) await deleteDocument(found.rows[0].storage_key);
    const result = await client.query<{ txid: string }>("DELETE FROM workspace_items WHERE workspace_id=$1 AND id=$2 RETURNING pg_current_xact_id()::text AS txid", [workspaceId, id]);
    await client.query("COMMIT");
    return { txid: result.rows[0].txid };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
