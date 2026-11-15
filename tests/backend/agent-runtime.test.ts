import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeAgent, MODEL_ID } from "../../src/server/agents/runtime";

test("pi sends primary instructions to direct MiniMax and executes only project tools", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-project-"));
  const originalFetch = globalThis.fetch, key = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "runtime-test-key";
  const calls: Record<string, unknown>[] = [];
  const output: string[] = [];
  let turn = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    expect(new URL(request.url).origin + new URL(request.url).pathname).toBe("https://api.minimax.io/anthropic/v1/messages");
    const body = await request.json() as Record<string, unknown>;
    calls.push(body);
    expect(body.model).toBe(MODEL_ID);
    expect(body.thinking).toMatchObject({ type: "adaptive" });
    expect(body.output_config).toMatchObject({ effort: "medium" });
    expect(JSON.stringify(body.system)).toContain("PRIMARY INSTRUCTIONS");
    expect((body.tools as { name: string }[]).map(tool => tool.name).sort()).toEqual(["project_bash", "project_edit", "project_read", "project_write"]);
    const tool = turn === 0 ? { name: "project_write", input: { path: "hello.txt", content: "hello from pi" } } : turn === 1 ? { name: "project_bash", input: { command: "cat hello.txt" } } : undefined;
    const id = `tool-${++turn}`;
    const events = [
      { type: "message_start", message: { id, type: "message", role: "assistant", model: MODEL_ID, content: [], stop_reason: null, usage: { input_tokens: 12, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: tool ? { type: "tool_use", id, name: tool.name, input: {} } : { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text: "Greeting created and read back." } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 15 } },
      { type: "message_stop" },
    ];
    return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  try {
    await executeAgent({ directory, prompt: "DISPATCH PROMPT", instructions: "PRIMARY INSTRUCTIONS", project: { title: "Test project", description: "Local" }, issue: { title: "Write greeting", description: "Create hello.txt" } }, event => output.push(event.text), AbortSignal.timeout(15_000));
    expect(await readFile(join(directory, "hello.txt"), "utf8")).toBe("hello from pi");
    expect(calls).toHaveLength(3);
    expect(JSON.stringify(calls[0].messages)).toContain("DISPATCH PROMPT");
    expect(JSON.stringify(calls[2].messages)).toContain("hello from pi");
    expect(output.join("")).toContain("Greeting created and read back.");
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.MINIMAX_API_KEY; else process.env.MINIMAX_API_KEY = key;
    await rm(directory, { recursive: true, force: true });
  }
});

test("project edit preserves literal dollar sequences in replacement code", async () => {
  const { createProjectTools } = await import("../../src/server/agents/runtime");
  const { writeFile } = await import("node:fs/promises");
  const directory = await mkdtemp(join(tmpdir(), "pi-edit-"));
  try {
    await writeFile(join(directory, "code.ts"), "old");
    const tool = createProjectTools(directory).find(tool => tool.name === "project_edit")!;
    const replacement = 'const escaped = "$& $$ $` $\'"';
    await tool.execute("edit-test", { path: "code.ts", oldText: "old", newText: replacement }, undefined, undefined, {} as Parameters<typeof tool.execute>[4]);
    expect(await readFile(join(directory, "code.ts"), "utf8")).toBe(replacement);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("MiniMax billing failures are actionable and never expose provider response secrets", async () => {
  const originalFetch = globalThis.fetch, key = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "billing-test-secret";
  const directory = await mkdtemp(join(tmpdir(), "pi-billing-"));
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ type: "error", error: { type: "insufficient_balance_error", message: "insufficient balance (1008) billing-test-secret" } }), { status: 402, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    let failure: unknown;
    try { await executeAgent({ directory, prompt: "Work", instructions: "Instructions", project: { title: "Test", description: "" }, issue: { title: "Test", description: "" } }, () => {}, AbortSignal.timeout(5000)); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("insufficient API balance");
    expect((failure as Error).message).not.toContain("billing-test-secret");
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.MINIMAX_API_KEY; else process.env.MINIMAX_API_KEY = key;
    await rm(directory, { recursive: true, force: true });
  }
});
