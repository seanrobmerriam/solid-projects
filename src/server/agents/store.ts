import { getPool } from "../db";
import { WorkspaceError } from "../workspace";
import { DEFAULT_AGENT, type AgentSettings, type AgentRun, type RunEvent } from "./types";
import type { WorkspaceItem } from "~/components/dashboard/data";

export function validateAgentSettings(value: unknown): AgentSettings {
  if (!value || typeof value !== "object") throw new WorkspaceError(400, "Enter a prompt and instructions");
  const { prompt, instructions } = value as Record<string, unknown>;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 8000 || typeof instructions !== "string" || !instructions.trim() || instructions.length > 32000) throw new WorkspaceError(400, "Prompt must be 1–8000 characters and instructions 1–32000 characters");
  return { prompt: prompt.trim(), instructions: instructions.trim() };
}
export async function agentSettings(workspaceId: string): Promise<AgentSettings> {
  const result = await getPool().query<AgentSettings>("SELECT prompt,instructions FROM workspace_agent_settings WHERE workspace_id=$1", [workspaceId]);
  return result.rows[0] ?? { ...DEFAULT_AGENT };
}
export async function saveAgentSettings(workspaceId: string, input: unknown) {
  const settings = validateAgentSettings(input);
  await getPool().query(`INSERT INTO workspace_agent_settings(workspace_id,prompt,instructions) VALUES($1,$2,$3)
    ON CONFLICT(workspace_id) DO UPDATE SET prompt=$2,instructions=$3,updated_at=now()`, [workspaceId, settings.prompt, settings.instructions]);
  return settings;
}
export const runColumns = `id,project_id AS "projectId",issue_id AS "issueId",status,created_at AS "createdAt"`;
export async function projectDetail(workspaceId: string, id: string) {
  const result = await getPool().query<{ kind: string; data: WorkspaceItem }>(`SELECT kind,data FROM workspace_items WHERE workspace_id=$1 AND (id=$2 OR data->>'projectId'=$2)`, [workspaceId, id]);
  const project = result.rows.find(row => row.kind === "projects" && row.data.id === id)?.data;
  if (!project) throw new WorkspaceError(404, "Project not found");
  const runs = await getPool().query<AgentRun>(`SELECT ${runColumns} FROM agent_runs WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC,id`, [workspaceId, id]);
  return { project, issues: result.rows.filter(row => row.kind === "issues").map(row => row.data), tasks: result.rows.filter(row => row.kind === "tasks").map(row => row.data), runs: runs.rows };
}
export async function findRun(workspaceId: string, id: string) {
  if (!/^[\da-f-]{36}$/i.test(id)) throw new WorkspaceError(404, "Run not found");
  const result = await getPool().query<AgentRun>(`SELECT ${runColumns} FROM agent_runs WHERE workspace_id=$1 AND id=$2`, [workspaceId, id]);
  if (!result.rows[0]) throw new WorkspaceError(404, "Run not found");
  return result.rows[0];
}
export async function runEvents(runId: string, after = 0): Promise<RunEvent[]> {
  return (await getPool().query<RunEvent>("SELECT seq,type,text FROM agent_run_events WHERE run_id=$1 AND seq>$2 ORDER BY seq LIMIT 200", [runId, after])).rows;
}
