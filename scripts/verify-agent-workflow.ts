// Explicit integration check: real disposable Postgres + pi SDK, controlled model transport.
// Never run against the production branch or with a real model credential.
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { getPool } from "../src/server/db";
import { ensureWorkspace, createItem } from "../src/server/workspace";
import { kickWorkspace } from "../src/server/agents/dispatcher";
import { projectDetail, runEvents, saveAgentSettings } from "../src/server/agents/store";
import type { AgentRun } from "../src/server/agents/types";

if (!/^(workflow-|ci-)/.test(process.env.NEON_BRANCH || "") || process.env.NEON_BRANCH_ID === "br-bitter-rain-be96x6qd") throw new Error("Use an explicitly disposable workflow/CI Neon branch");
process.env.MINIMAX_API_KEY = "controlled-transport-test-key";
const pool = getPool();
const originalFetch = globalThis.fetch;
let release!: () => void;
const gate = new Promise<void>(resolve => { release = resolve; });
let arrivals = 0;
let hold = true;
let overflow = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  assert.equal(new URL(request.url).hostname, "api.minimax.io");
  const body = await request.json() as { messages: unknown[]; system: unknown; model: string };
  assert.equal(body.model, "MiniMax-M3.1-Flash");
  assert.ok(JSON.stringify(body.system).includes("Primary verification instructions"));
  if (overflow) {
    const events = [
      { type: "message_start", message: { id: "overflow", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Accepted before limit." } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "x".repeat(1024 * 1024) } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 10 } },
      { type: "message_stop" },
    ];
    return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  }
  const final = JSON.stringify(body.messages).includes("tool_result");
  if (!final && hold) { arrivals++; await gate; }
  const id = crypto.randomUUID();
  const events = [
    { type: "message_start", message: { id, type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: final ? { type: "text", text: "" } : { type: "tool_use", id, name: "project_write", input: {} } },
    { type: "content_block_delta", index: 0, delta: final ? { type: "text_delta", text: "Verified greeting created." } : { type: "input_json_delta", partial_json: JSON.stringify({ path: "greeting.txt", content: "hello from the project agent" }) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: final ? "end_turn" : "tool_use", stop_sequence: null }, usage: { output_tokens: 10 } },
    { type: "message_stop" },
  ];
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}) as typeof fetch;
const delay = () => new Promise(resolve => setTimeout(resolve, 100));
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) { if (await check()) return; await delay(); }
  throw new Error(`Timed out: ${label}`);
}
async function createProject() {
  const user = { id: `agent-check-${crypto.randomUUID()}`, email: "agent-check@example.test" };
  const workspaceId = await ensureWorkspace(user.id);
  await saveAgentSettings(workspaceId, { prompt: "Work on this issue", instructions: "Primary verification instructions" });
  const form = new FormData(); form.set("kind", "projects"); form.set("title", "Agent integration project");
  const { item: project } = await createItem(user, workspaceId, form);
  return { user, workspaceId, project };
}
type Fixture = Awaited<ReturnType<typeof createProject>>;
async function createIssue(fixture: Fixture, requestId = crypto.randomUUID()) {
  const form = new FormData(); form.set("kind", "issues"); form.set("title", "Write a greeting"); form.set("projectId", fixture.project.id); form.set("requestId", requestId);
  return (await createItem(fixture.user, fixture.workspaceId, form)).item;
}
async function runs(fixture: Fixture) { return (await projectDetail(fixture.workspaceId, fixture.project.id)).runs; }
async function completed(fixture: Fixture) { await until(async () => (await runs(fixture)).every(run => run.status === "Completed"), "completed agent run"); }
try {
  const fixtures: Fixture[] = [];
  // Fill all four dispatcher slots, then enqueue work for a fifth workspace.
  for (let i = 0; i < 4; i++) {
    const fixture = await createProject(); fixtures.push(fixture);
    await createIssue(fixture); kickWorkspace(fixture.workspaceId);
  }
  await until(async () => arrivals === 4, "four active agent sessions");
  const fifth = await createProject(); fixtures.push(fifth);
  const requestId = crypto.randomUUID();
  const [first, repeated] = await Promise.all([createIssue(fifth, requestId), createIssue(fifth, requestId)]);
  assert.equal(first.id, repeated.id); assert.equal(first.runId, repeated.runId);
  kickWorkspace(fifth.workspaceId);
  await delay(); hold = false; release();
  for (const fixture of fixtures) {
    await completed(fixture);
    const detail = await projectDetail(fixture.workspaceId, fixture.project.id);
    assert.equal(detail.runs.length, 1);
    assert.equal(await readFile(`${fixture.project.projectDirectory}/greeting.txt`, "utf8"), "hello from the project agent");
    const events = await runEvents(detail.runs[0].id);
    assert.ok(events.map(event => event.text).join("").includes("Verified greeting created."));
    assert.ok(events.map(event => event.text).join("").includes("File saved."));
    assert.deepEqual(events.map(event => event.seq), events.map((_, index) => index + 1));
  }
  console.log("PASS: five workspaces drain after capacity frees; duplicate issue enqueues exactly one run; real pi writes isolated project files and ordered output persists in Postgres");
  const fixture = await createProject();
  const interrupted = await createIssue(fixture);
  await pool.query("UPDATE agent_runs SET status='Running' WHERE id=$1", [interrupted.runId]);
  await createIssue(fixture); await createIssue(fixture);
  kickWorkspace(fixture.workspaceId);
  await until(async () => {
    const result = await runs(fixture);
    return result.filter(run => run.status === "Completed").length === 2 && result.some(run => run.status === "Interrupted");
  }, "interrupted recovery and sequential pending issues");
  const ordered = (await pool.query<{ id: string; started_at: Date; finished_at: Date }>("SELECT id,started_at,finished_at FROM agent_runs WHERE workspace_id=$1 AND status='Completed' ORDER BY started_at", [fixture.workspaceId])).rows;
  assert.ok(ordered[0].finished_at <= ordered[1].started_at);
  assert.ok((await runEvents(interrupted.runId!)).some(event => event.text.includes("not retried")));
  console.log("PASS: interrupted run is preserved without retry; two pending issues execute sequentially within the same project");
  const bounded = await createProject();
  const boundedIssue = await createIssue(bounded);
  overflow = true; kickWorkspace(bounded.workspaceId);
  await until(async () => (await runs(bounded)).some(run => run.status === "Failed"), "bounded output stops run");
  assert.ok((await runEvents(boundedIssue.runId!)).some(event => event.text.includes("Accepted before limit.")));
  console.log("PASS: output-limit interruption preserves text accepted before cancellation");
  // The process is a disposable verification worker; exiting releases its direct advisory-lock connections.
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Agent integration verification failed");
  process.exit(1);
} finally { globalThis.fetch = originalFetch; }
