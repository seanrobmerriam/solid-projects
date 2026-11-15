export interface AgentSettings { prompt: string; instructions: string }
export interface AgentRun { id: string; projectId: string; issueId: string; status: "Queued" | "Running" | "Completed" | "Failed" | "Interrupted"; createdAt: string }
export interface RunEvent { seq: number; type: "text" | "tool" | "status"; text: string }
export const DEFAULT_AGENT: AgentSettings = {
  prompt: "Work on the issue below in its project folder. Explain what you changed and anything you could not complete.",
  instructions: "# Agent instructions\n\nRead the issue and project context before starting. Make focused changes that address the issue. Use only the provided project file tools and supported just-bash commands. Do not access other folders or attempt native command execution. Finish with a concise summary of changes and any limits to verification.",
};
