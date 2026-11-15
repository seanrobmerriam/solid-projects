import { Pool, type PoolClient } from "pg";
import { getPool, databaseConfig } from "../db";
import { ensureProjectDirectory } from "./files";
import { agentSettings, runColumns } from "./store";
import { executeAgent, AgentProviderError } from "./runtime";
import type { AgentRun, RunEvent } from "./types";
import type { WorkspaceItem } from "~/components/dashboard/data";

let locks: Pool | undefined;
function lockPool() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url || new URL(url).hostname.includes("-pooler")) throw new Error("Agent execution requires DATABASE_URL_UNPOOLED");
  return locks ??= new Pool({ ...databaseConfig(url), max: 4 });
}
const active = new Map<string, Promise<void>>();
const pendingScans = new Map<string, Promise<void>>();
const waitingWorkspaces = new Set<string>();
export function kickWorkspace(workspaceId: string) {
  waitingWorkspaces.add(workspaceId);
  if (pendingScans.has(workspaceId)) return;
  const task = scan(workspaceId).catch(() => console.error("Agent dispatch scan failed")).finally(() => pendingScans.delete(workspaceId));
  pendingScans.set(workspaceId, task);
}
async function scan(workspaceId: string) {
  const projects = await getPool().query<{ project_id: string }>("SELECT DISTINCT project_id FROM agent_runs WHERE workspace_id=$1 AND status IN ('Queued','Running') LIMIT 20", [workspaceId]);
  if (!projects.rows.length) waitingWorkspaces.delete(workspaceId);
  for (const { project_id } of projects.rows) {
    const key = `${workspaceId}/${project_id}`;
    if (active.has(key) || active.size >= 4) continue;
    const task = drainProject(workspaceId, project_id).then(() => {
      setTimeout(() => { for (const waiting of waitingWorkspaces) kickWorkspace(waiting); }, 1000).unref?.();
    }).catch(() => console.error("Agent dispatcher failed; reopen the project after checking server configuration")).finally(() => { active.delete(key); });
    active.set(key, task);
  }
}
async function addEvent(runId: string, event: Omit<RunEvent, "seq">) {
  await getPool().query(`INSERT INTO agent_run_events(run_id,seq,type,text)
    SELECT $1,COALESCE(MAX(seq),0)+1,$2,$3 FROM agent_run_events WHERE run_id=$1`, [runId, event.type, event.text]);
}
async function drainProject(workspaceId: string, projectId: string) {
  const client = await lockPool().connect();
  const key = `agent/${workspaceId}/${projectId}`;
  let locked = false;
  const controller = new AbortController();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const onError = () => controller.abort(new Error("Agent execution connection was lost"));
  client.on("error", onError);
  try {
    locked = (await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [key])).rows[0].locked;
    if (!locked) return;
    // Only the holder of this project's direct-connection lock may recover it.
    const interrupted = await getPool().query<{ id: string }>("UPDATE agent_runs SET status='Interrupted',finished_at=now() WHERE workspace_id=$1 AND project_id=$2 AND status='Running' RETURNING id", [workspaceId, projectId]);
    for (const run of interrupted.rows) await addEvent(run.id, { type: "status", text: "Interrupted: the previous server stopped. File changes were preserved; this run was not retried.\n" });
    heartbeat = setInterval(() => { void client.query("SELECT 1").catch(onError); }, 5000);
    heartbeat.unref?.();
    while (!controller.signal.aborted) {
      const settings = await agentSettings(workspaceId);
      const claimed = await getPool().query<AgentRun>(`UPDATE agent_runs SET status='Running',started_at=now(),settings=$3::jsonb WHERE id=(
        SELECT id FROM agent_runs WHERE workspace_id=$1 AND project_id=$2 AND status='Queued' ORDER BY created_at,id LIMIT 1)
        RETURNING ${runColumns}`, [workspaceId, projectId, JSON.stringify(settings)]);
      const run = claimed.rows[0];
      if (!run) break;
      await performRun(client, workspaceId, run, settings, controller.signal);
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]).catch(() => {});
    client.removeListener("error", onError);
    client.release(controller.signal.aborted);
  }
}
async function performRun(_lock: PoolClient, workspaceId: string, run: AgentRun, settings: Awaited<ReturnType<typeof agentSettings>>, connectionSignal: AbortSignal) {
  let chain = Promise.resolve();
  let bytes = 0;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, connectionSignal, AbortSignal.timeout(10 * 60_000)]);
  let buffered = "";
  const persist = (event: Omit<RunEvent, "seq">) => {
    chain = chain.then(async () => { await addEvent(run.id, event); }).catch(error => { controller.abort(error); });
  };
  const flush = () => { if (buffered) { persist({ type: "text", text: buffered }); buffered = ""; } };
  const flushTimer = setInterval(flush, 150);
  const emit = (event: Omit<RunEvent, "seq">) => {
    if (signal.aborted) return;
    bytes += Buffer.byteLength(event.text);
    if (bytes > 1024 * 1024) { controller.abort(new Error("Agent output exceeded 1 MiB")); return; }
    if (event.type === "text") {
      buffered += event.text;
      while (buffered.length >= 4000) { persist({ type: "text", text: buffered.slice(0, 4000) }); buffered = buffered.slice(4000); }
    } else { flush(); persist({ ...event, text: event.text.slice(0, 16000) }); }
  };
  try {
    await addEvent(run.id, { type: "status", text: "Running\n" });
    const rows = await getPool().query<{ id: string; data: WorkspaceItem }>("SELECT id,data FROM workspace_items WHERE workspace_id=$1 AND id IN ($2,$3)", [workspaceId, run.projectId, run.issueId]);
    const project = rows.rows.find(row => row.id === run.projectId)?.data;
    const issue = rows.rows.find(row => row.id === run.issueId)?.data;
    if (!project || !issue) throw new Error("Project or issue is no longer available");
    const directory = await ensureProjectDirectory(workspaceId, run.projectId);
    if (project.projectDirectory !== directory) await getPool().query("UPDATE workspace_items SET data=jsonb_set(data,'{projectDirectory}',to_jsonb($3::text)),updated_at=now() WHERE workspace_id=$1 AND id=$2", [workspaceId, run.projectId, directory]);
    await executeAgent({ ...settings, directory, project, issue }, emit, signal);
    flush();
    await chain;
    signal.throwIfAborted();
    await addEvent(run.id, { type: "status", text: "Completed · ready for review\n" });
    await getPool().query("UPDATE agent_runs SET status='Completed',finished_at=now() WHERE id=$1", [run.id]);
  } catch (error) {
    flush();
    await chain;
    // Never expose provider response bodies, credentials, or host filesystem errors.
    const message = !process.env.MINIMAX_API_KEY ? "Set MINIMAX_API_KEY on the local server to start the agent." : error instanceof AgentProviderError ? error.message : signal.aborted ? "Run interrupted or its execution limit was reached. File changes were preserved." : "Agent run failed. Check MiniMax credentials/model access and the local project directory.";
    await addEvent(run.id, { type: "status", text: `${message}\n` });
    await getPool().query("UPDATE agent_runs SET status=$2,finished_at=now() WHERE id=$1", [run.id, connectionSignal.aborted ? "Interrupted" : "Failed"]);
  } finally { clearInterval(flushTimer); }
}
