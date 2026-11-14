import { Drawer } from "@ark-ui/solid/drawer";
import { ark } from "@ark-ui/solid/factory";
import { X } from "lucide-solid";
import { Show, createEffect, createSignal, onCleanup, type ParentProps } from "solid-js";
import { Portal } from "solid-js/web";
import { useWorkspace } from "./WorkspaceContext";
import type { RunEvent } from "~/server/agents/types";

function RunOutput(props: { id: string }) {
  const workspace = useWorkspace();
  const [output, setOutput] = createSignal("");
  const [status, setStatus] = createSignal("Connecting…");
  const [error, setError] = createSignal("");
  let log: HTMLPreElement | undefined;
  createEffect(() => {
    const id = props.id;
    setOutput(""); setStatus("Connecting…"); setError("");
    let seen = 0;
    const events = new EventSource(`/api/agent/runs/${encodeURIComponent(id)}/events?user=${encodeURIComponent(workspace.userId() || "")}`);
    events.addEventListener("output", raw => {
      const event = JSON.parse((raw as MessageEvent).data) as RunEvent;
      if (event.seq <= seen) return;
      seen = event.seq;
      const follow = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      setOutput(text => `${text}${event.type === "tool" ? `\n${event.text}` : event.text}`);
      if (follow) queueMicrotask(() => log?.scrollTo({ top: log.scrollHeight }));
    });
    events.addEventListener("state", raw => { setStatus(JSON.parse((raw as MessageEvent).data).status); setError(""); });
    events.addEventListener("done", () => events.close());
    events.addEventListener("failure", raw => { setError(JSON.parse((raw as MessageEvent).data).error); events.close(); });
    events.onerror = () => setError("Output connection lost. Reconnecting…");
    onCleanup(() => events.close());
  });
  return <>
    <ark.div class="agent-run-status" role="status">{status()}</ark.div>
    <Show when={error()}><ark.p role="alert" class="form-error">{error()}</ark.p></Show>
    <ark.pre ref={log} class="agent-output" tabIndex={0} aria-label="Agent output log">{output() || "Waiting for agent output…"}</ark.pre>
  </>;
}
export default function AgentDrawer(props: ParentProps) {
  const workspace = useWorkspace();
  return <Drawer.Stack><Drawer.Root open={Boolean(workspace.activeRun())} onOpenChange={details => { if (!details.open) workspace.setActiveRun(null); }} swipeDirection="end" lazyMount unmountOnExit>
    <Drawer.IndentBackground class="agent-indent-background" />
    <Drawer.Indent class="agent-indent">{props.children}</Drawer.Indent>
    <Portal><Drawer.Backdrop class="dialog-backdrop agent-drawer-backdrop" /><Drawer.Positioner class="agent-drawer-positioner"><Drawer.Content class="agent-drawer">
      <ark.div class="dialog-heading"><Drawer.Title>Agent output</Drawer.Title><Drawer.CloseTrigger class="icon-button" aria-label="Close agent output"><X size={18} /></Drawer.CloseTrigger></ark.div>
      <Drawer.Description class="muted">Live output from the project agent. Closing this window lets work continue.</Drawer.Description>
      <Show when={workspace.activeRun()} keyed>{id => <RunOutput id={id} />}</Show>
    </Drawer.Content></Drawer.Positioner></Portal>
  </Drawer.Root></Drawer.Stack>;
}
