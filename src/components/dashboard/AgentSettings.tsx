import { ark } from "@ark-ui/solid/factory";
import { Field } from "@ark-ui/solid/field";
import { Show, createSignal, onMount } from "solid-js";
import { useWorkspace } from "./WorkspaceContext";
import type { AgentSettings as Settings } from "~/server/agents/types";

export default function AgentSettings() {
  const workspace = useWorkspace();
  const [prompt, setPrompt] = createSignal("");
  const [instructions, setInstructions] = createSignal("");
  const [ready, setReady] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  onMount(() => {
    void workspace.request<Settings>("/api/agent/settings").then(settings => { setPrompt(settings.prompt); setInstructions(settings.instructions); setReady(true); }).catch(cause => setError(cause.message));
  });
  return <ark.section class="agent-settings page-summary">
    <ark.h2>Default agent</ark.h2><ark.p class="muted">New project issues are sent to this agent using MiniMax M3.1. Changes apply to runs that have not started.</ark.p>
    <ark.form class="create-form" onSubmit={async event => {
      event.preventDefault(); if (pending()) return;
      setPending(true); setError(""); setSaved(false);
      const form = new FormData(); form.set("prompt", prompt()); form.set("instructions", instructions());
      try { await workspace.request<Settings>("/api/agent/settings", { method: "PUT", body: form }); setSaved(true); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save agent settings"); }
      finally { setPending(false); }
    }}>
      <Field.Root required><Field.Label>Dispatch prompt</Field.Label><Field.Textarea value={prompt()} onInput={event => { setPrompt(event.currentTarget.value); setSaved(false); }} rows={4} maxLength={8000} disabled={!ready()} /><Field.HelperText>Sent with each issue’s title, description and project context.</Field.HelperText></Field.Root>
      <Field.Root required><Field.Label>instructions.md</Field.Label><Field.Textarea class="agent-instructions" value={instructions()} onInput={event => { setInstructions(event.currentTarget.value); setSaved(false); }} rows={12} maxLength={32000} disabled={!ready()} /><Field.HelperText>The agent’s primary instructions for starting and completing issue work.</Field.HelperText></Field.Root>
      <Show when={error()}><ark.p class="form-error" role="alert">{error()}</ark.p></Show>
      <Show when={saved()}><ark.p role="status">Agent settings saved.</ark.p></Show>
      <ark.div class="dialog-actions"><ark.button class="button primary" type="submit" disabled={!ready() || pending()}>{pending() ? "Saving…" : "Save agent"}</ark.button></ark.div>
    </ark.form>
  </ark.section>;
}
