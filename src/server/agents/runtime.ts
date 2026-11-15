import { defineTool, createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager, type ResourceLoader, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { projectFiles } from "./files";
import type { AgentSettings, RunEvent } from "./types";

export class AgentProviderError extends Error {}

export const MODEL_ID = "MiniMax-M3.1-Flash";
export const MODEL_BASE_URL = "https://api.minimax.io/anthropic";
export function createProjectTools(directory: string): ToolDefinition[] {
  const files = projectFiles(directory);
  const output = (text: string) => ({ content: [{ type: "text" as const, text: text.slice(0, 64 * 1024) }], details: {} });
  return [
    defineTool({ name: "project_read", executionMode: "sequential", label: "Read project file", description: "Read a UTF-8 file using a path relative to the project folder.",
      parameters: Type.Object({ path: Type.String() }), execute: async (_id, args) => output(await files.read(String(args.path))) }),
    defineTool({ name: "project_write", executionMode: "sequential", label: "Write project file", description: "Create or replace a UTF-8 file in the project folder. Use a relative path.",
      parameters: Type.Object({ path: Type.String(), content: Type.String() }), execute: async (_id, args) => { await files.write(String(args.path), String(args.content)); return output("File saved."); } }),
    defineTool({ name: "project_edit", executionMode: "sequential", label: "Edit project file", description: "Replace one exact occurrence of text in a project file. Fails if absent or ambiguous.",
      parameters: Type.Object({ path: Type.String(), oldText: Type.String({ minLength: 1 }), newText: Type.String() }),
      execute: async (_id, args) => {
        const path = String(args.path), oldText = String(args.oldText), text = await files.read(path);
        if (!oldText || text.split(oldText).length !== 2) throw new Error("Text must match exactly once");
        await files.write(path, text.replace(oldText, () => String(args.newText))); return output("File updated.");
      } }),
    defineTool({ name: "project_bash", executionMode: "sequential", label: "Project shell", description: "Run supported just-bash commands in the project folder. No native binaries, network, Python, or JS execution. The virtual root / is the project folder. Shell state resets each call; files persist.",
      parameters: Type.Object({ command: Type.String() }), execute: async (_id, args, signal) => {
        const result = await files.bash(String(args.command), signal);
        return output(`Exit ${result.exitCode}\n${result.stdout}\n${result.stderr}`);
      } }),
  ];
}
export async function executeAgent(input: AgentSettings & { directory: string; issue: { title: string; description: string }; project: { title: string; description: string } }, emit: (event: Omit<RunEvent, "seq">) => void, signal: AbortSignal) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("Set MINIMAX_API_KEY on the local server to start the agent.");
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(), modelsPath: null, refreshOnCreate: false });
  modelRuntime.registerProvider("solid-minimax", { baseUrl: MODEL_BASE_URL, api: "anthropic-messages", apiKey,
    models: [{ id: MODEL_ID, name: MODEL_ID, reasoning: true, compat: { forceAdaptiveThinking: true }, input: ["text"], contextWindow: 1_000_000, maxTokens: 8192, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] });
  const model = modelRuntime.getModel("solid-minimax", MODEL_ID);
  if (!model) throw new Error("MiniMax M3.1 model configuration is unavailable");
  const loader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => input.instructions,
    getSystemPromptSource: () => undefined, getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
  };
  const { session } = await createAgentSession({ cwd: input.directory, agentDir: input.directory, model, modelRuntime, resourceLoader: loader,
    tools: ["project_read", "project_write", "project_edit", "project_bash"], customTools: createProjectTools(input.directory),
    sessionManager: SessionManager.inMemory(input.directory), settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }), thinkingLevel: "medium" });
  const abort = () => { void session.abort(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    session.subscribe(event => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") emit({ type: "text", text: event.assistantMessageEvent.delta });
      if (event.type === "tool_execution_start") emit({ type: "tool", text: `Starting ${event.toolName}\n` });
      if (event.type === "tool_execution_end") {
        const text = event.result?.content?.filter((part: { type: string }) => part.type === "text").map((part: { text?: string }) => part.text || "").join("\n") || "";
        emit({ type: "tool", text: `${event.toolName}: ${event.isError ? "failed" : "finished"}\n${text.slice(0, 8000)}\n` });
      }
    });
    await session.prompt(`${input.prompt}\n\nProject: ${input.project.title}\n${input.project.description}\n\nIssue: ${input.issue.title}\n${input.issue.description}`);
    signal.throwIfAborted();
    const last = session.messages.filter(message => message.role === "assistant").at(-1);
    if (last?.role === "assistant" && (last.stopReason === "error" || last.stopReason === "aborted")) {
      // Only expose fixed application messages, never a raw provider response.
      const billing = /insufficient[ _]balance/i.test(last.errorMessage || "");
      throw new AgentProviderError(billing
        ? "MiniMax reports insufficient API balance (1008). Check the balance and API access for MINIMAX_API_KEY in MiniMax."
        : "MiniMax could not complete this run. Check the server credential and model access.");
    }
  } finally { signal.removeEventListener("abort", abort); await session.dispose(); }
}
