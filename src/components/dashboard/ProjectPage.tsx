import { A, useParams } from "@solidjs/router";
import { ark } from "@ark-ui/solid/factory";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { useWorkspace } from "./WorkspaceContext";
import { statusTone, type WorkspaceItem } from "./data";
import type { AgentRun } from "~/server/agents/types";
interface Detail { project: WorkspaceItem; issues: WorkspaceItem[]; tasks: WorkspaceItem[]; runs: AgentRun[] }
export default function ProjectPage() {
  const workspace = useWorkspace();
  const params = useParams();
  const [detail, setDetail] = createSignal<Detail>();
  const [error, setError] = createSignal("");
  createEffect(() => {
    const id = params.id || "";
    setDetail(undefined); setError("");
    let disposed = false;
    const opened = new Set<string>();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const value = await workspace.request<Detail>(`/api/agent/projects/${encodeURIComponent(id)}`);
        if (disposed) return;
        setDetail(value); setError("");
        const running = value.runs.find(run => run.status === "Running");
        if (running && !opened.has(running.id)) { opened.add(running.id); workspace.setActiveRun(running.id); }
      } catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : "Could not load project"); }
      if (!disposed) timer = setTimeout(() => { void load(); }, 2000);
    };
    void load();
    onCleanup(() => { disposed = true; clearTimeout(timer); });
  });
  return <ark.div class="project-page">
    <Show when={error()}><ark.p class="form-error" role="alert">{error()}</ark.p></Show>
    <Show when={detail()} fallback={<ark.p class="muted">Loading project…</ark.p>}>{value => <>
      <ark.section class="page-summary">
        <A href="/dashboard/views/projects" class="project-back">← All Projects</A>
        <ark.div class="page-heading"><ark.div><ark.h2>{value().project.title}</ark.h2><ark.p>{value().project.description || "No description yet."}</ark.p></ark.div></ark.div>
        <ark.dl class="detail-metadata"><ark.div><ark.dt>Status</ark.dt><ark.dd>{value().project.status}</ark.dd></ark.div><ark.div><ark.dt>Owner</ark.dt><ark.dd>{value().project.owner}</ark.dd></ark.div><For each={Object.entries({ Reference: value().project.code, Progress: value().project.progress == null ? undefined : `${value().project.progress}%`, Priority: value().project.priority, "Due date": value().project.dueDate, Created: value().project.createdAt, Updated: value().project.updatedAt, Tags: value().project.tags.join(", ") }).filter(([, entry]) => entry)}>{([label, entry]) => <ark.div><ark.dt>{label}</ark.dt><ark.dd>{entry}</ark.dd></ark.div>}</For><ark.div><ark.dt>Project folder</ark.dt><ark.dd class="project-folder">{value().project.projectDirectory || "Created when agent work starts"}</ark.dd></ark.div></ark.dl>
      </ark.section>
      <ark.section class="project-related" aria-label="Project issues">
        <ark.div class="page-heading"><ark.h2>Issues <ark.span class="collection-count">{value().issues.length}</ark.span></ark.h2><ark.button class="button primary" aria-label="Create issue" onClick={() => workspace.setCreateKind("issues")}>+ Issue</ark.button></ark.div>
        <For each={value().issues} fallback={<ark.p class="muted">No issues yet.</ark.p>}>{issue => {
          const run = () => value().runs.find(run => run.issueId === issue.id);
          return <ark.div class="project-issue-row"><ark.button class="project-item-button" onClick={() => workspace.setSelected({ kind: "issues", item: issue })}><ark.strong>{issue.title}</ark.strong><ark.span class="muted">{issue.description}</ark.span></ark.button><ark.span class={`badge ${statusTone(run()?.status || issue.status)}`}>{run()?.status || issue.status}</ark.span><Show when={run()}>{current => <ark.button class="button" onClick={() => workspace.setActiveRun(current().id)}>View output</ark.button>}</Show></ark.div>;
        }}</For>
      </ark.section>
      <ark.section class="project-related" aria-label="Project tasks"><ark.h2>Tasks <ark.span class="collection-count">{value().tasks.length}</ark.span></ark.h2><For each={value().tasks} fallback={<ark.p class="muted">No tasks yet.</ark.p>}>{task => <ark.div class="project-issue-row"><ark.strong>{task.title}</ark.strong><ark.span class="badge neutral">{task.status}</ark.span></ark.div>}</For></ark.section>
    </>}</Show>
  </ark.div>;
}
