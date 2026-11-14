import { Dialog } from "@ark-ui/solid/dialog";
import { Field } from "@ark-ui/solid/field";
import { ark } from "@ark-ui/solid/factory";
import { FileText, Plus, X } from "lucide-solid";
import { For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useAuth } from "~/components/Context";
import { useWorkspace } from "./WorkspaceContext";
import { formatDate, formatSize, singular, statusTone, type CollectionKind } from "./data";

function CreateForm(props: { kind: CollectionKind }) {
  const workspace = useWorkspace();
  const { session } = useAuth();
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const label = () => singular[props.kind].toLowerCase();

  return (
    <ark.form class="create-form" onSubmit={async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const name = String(data.get("name") ?? "").trim();
      if (!name) { setError("Enter a name to continue."); return; }
      if (pending()) return;
      const attachment = data.get("file");
      const file = attachment instanceof File && attachment.name ? attachment : undefined;
      if (file && file.size > 10 * 1024 * 1024) { setError("Choose a file no larger than 10 MiB."); return; }
      setError("");
      setPending(true);
      try {
        await workspace.addItem(props.kind, name, String(data.get("description") ?? "").trim(), session()?.email ?? "My account", file);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save this item. Please try again.");
      } finally { setPending(false); }
    }}>
      <Field.Root required>
        <Field.Label>Name</Field.Label>
        <Field.Input name="name" placeholder={`Give your ${label()} a name`} maxLength={160} autofocus />
      </Field.Root>
      <Field.Root>
        <Field.Label>Description <ark.span class="muted">(optional)</ark.span></Field.Label>
        <Field.Textarea name="description" placeholder="Add a little context for your team…" rows={4} maxLength={2000} />
      </Field.Root>
      <Show when={props.kind === "documents"}>
        <Field.Root>
          <Field.Label>File <ark.span class="muted">(optional)</ark.span></Field.Label>
          <Field.Input type="file" name="file" disabled={pending()} />
          <Field.HelperText>Upload a file up to 10 MiB. It will be saved securely with this document.</Field.HelperText>
        </Field.Root>
      </Show>
      <Show when={error()}><ark.p class="form-error" role="alert">{error()}</ark.p></Show>
      <ark.p class="form-note">Items are saved to your workspace and available after you reload.</ark.p>
      <ark.div class="dialog-actions"><Dialog.CloseTrigger class="button" type="button">Cancel</Dialog.CloseTrigger><ark.button class="button primary" type="submit" disabled={pending() || !workspace.ready()}><Plus size={15} />{pending() ? "Saving…" : `Create ${label()}`}</ark.button></ark.div>
    </ark.form>
  );
}

export default function WorkspaceDialogs() {
  const workspace = useWorkspace();

  return (
    <>
      <Show when={workspace.createKind()} keyed>{kind => (
        <Dialog.Root open onOpenChange={details => { if (!details.open) workspace.setCreateKind(null); }}>
          <Portal><Dialog.Backdrop class="dialog-backdrop" /><Dialog.Positioner class="dialog-positioner"><Dialog.Content class="workspace-dialog">
            <ark.div class="dialog-heading"><Dialog.Title>New {singular[kind].toLowerCase()}</Dialog.Title><Dialog.CloseTrigger class="icon-button" aria-label="Close dialog"><X size={18} /></Dialog.CloseTrigger></ark.div>
            <Dialog.Description class="muted">Add a {singular[kind].toLowerCase()} to your workspace.</Dialog.Description>
            <CreateForm kind={kind} />
          </Dialog.Content></Dialog.Positioner></Portal>
        </Dialog.Root>
      )}</Show>
      <Show when={workspace.selected()} keyed>{selection => {
        const item = selection.item;
        const project = workspace.collections.projects.find(project => project.id === item.projectId);
        const metadata = [
          ["Owner", item.owner], ["Project", project?.title], ["Reference", item.code],
          ["Priority", item.priority], ["Progress", item.progress != null ? `${item.progress}%` : undefined],
          ["Due date", item.dueDate ? formatDate(item.dueDate) : undefined],
          ["File type", item.fileType], ["Size", item.size != null ? formatSize(item.size) : undefined],
          ["Version", item.version], ["Created", item.createdAt ? formatDate(item.createdAt) : undefined],
          ["Updated", formatDate(item.updatedAt)],
        ].filter((row): row is [string, string] => Boolean(row[1]));
        return (
          <Dialog.Root open onOpenChange={details => { if (!details.open) workspace.setSelected(null); }}>
            <Portal><Dialog.Backdrop class="dialog-backdrop" /><Dialog.Positioner class="dialog-positioner"><Dialog.Content class="workspace-dialog detail-dialog">
              <ark.div class="detail-topline"><ark.span class="detail-kind"><FileText size={16} />{singular[selection.kind]}</ark.span><Dialog.CloseTrigger class="icon-button" aria-label="Close details"><X size={18} /></Dialog.CloseTrigger></ark.div>
              <Dialog.Title>{item.title}</Dialog.Title>
              <ark.span class={`badge ${statusTone(item.status)}`}>{item.status}</ark.span>
              <Dialog.Description>{item.description || "No description yet."}</Dialog.Description>
              <ark.dl class="detail-metadata"><For each={metadata}>{([label, value]) => <ark.div><ark.dt>{label}</ark.dt><ark.dd>{value}</ark.dd></ark.div>}</For></ark.dl>
              <Show when={item.tags.length}><ark.div class="detail-tags"><For each={item.tags}>{tag => <ark.span class="badge neutral">{tag}</ark.span>}</For></ark.div></Show>
              <ark.div class="dialog-actions"><Show when={selection.kind === "documents" && item.hasFile}><ark.a class="button primary" href={`/api/workspace/documents/${encodeURIComponent(item.id)}/file`} download={item.filename || ""}>Download file</ark.a></Show><Dialog.CloseTrigger class="button">Done</Dialog.CloseTrigger></ark.div>
            </Dialog.Content></Dialog.Positioner></Portal>
          </Dialog.Root>
        );
      }}</Show>
    </>
  );
}
