import { useListCollection } from "@ark-ui/solid/collection";
import { Field } from "@ark-ui/solid/field";
import { ark } from "@ark-ui/solid/factory";
import { Listbox } from "@ark-ui/solid/listbox";
import { Progress } from "@ark-ui/solid/progress";
import { ArrowUpRight, CircleDot, FileText, FolderKanban, Search } from "lucide-solid";
import { For, Show, createEffect } from "solid-js";
import { useWorkspace } from "./WorkspaceContext";
import { formatDate, formatSize, statusTone, type CollectionKind, type WorkspaceItem } from "./data";

const icons = { projects: FolderKanban, issues: CircleDot, documents: FileText };

export default function CollectionPanel(props: { kind: CollectionKind; heading?: boolean; currentOnly?: boolean }) {
  const workspace = useWorkspace();
  const Icon = icons[props.kind];
  const title = () => `All ${props.kind[0].toUpperCase()}${props.kind.slice(1)}`;
  const projectName = (item: WorkspaceItem) => workspace.collections.projects.find(project => project.id === item.projectId)?.title ?? "Workspace";
  const items = () => props.currentOnly
    ? workspace.collections[props.kind].filter(item => item.status !== "Resolved")
    : workspace.collections[props.kind];
  const { collection, set, filter } = useListCollection<WorkspaceItem>({
    initialItems: items(),
    itemToValue: item => item.id,
    itemToString: item => item.title,
    filter: (_text, query, item) => [item.title, item.description, item.code, item.owner, item.status, item.priority, item.fileType, projectName(item), ...item.tags]
      .join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  });
  createEffect(() => { set(items()); filter(workspace.filters[props.kind]); });
  const selectedValue = () => workspace.selected()?.kind === props.kind ? [workspace.selected()!.item.id] : [];

  return (
    <ark.section class="collection-panel" aria-label={`${props.kind} collection`}>
      <Listbox.Root collection={collection()} selectionMode="single" value={selectedValue()} onSelect={details => {
        const item = collection().find(details.value);
        if (item) workspace.setSelected({ kind: props.kind, item });
      }} class="collection-root">
        <ark.div class="collection-toolbar">
          <Listbox.Label asChild={labelProps => props.heading
            ? <ark.h2 {...labelProps()} class="collection-title"><Icon size={17} />{props.currentOnly ? "Current Issues" : title()}<ark.span class="collection-count">{items().length}</ark.span></ark.h2>
            : <ark.span {...labelProps()} class="sr-only">{title()}</ark.span>}
          />
          <Show when={!props.heading}><ark.span class="collection-caption"><Icon size={16} />{items().length} {props.kind}</ark.span></Show>
          <Field.Root class="collection-search">
            <Field.Label class="sr-only">Filter {props.kind}</Field.Label>
            <Search size={15} />
            <Field.Input type="search" placeholder={`Filter ${props.kind}…`} value={workspace.filters[props.kind]} onInput={event => workspace.setFilter(props.kind, event.currentTarget.value)} />
          </Field.Root>
        </ark.div>
        <ark.div class={`collection-columns ${props.kind}-columns`} aria-hidden="true">
          <ark.span>{props.kind === "projects" ? "Project" : props.kind === "issues" ? "Issue" : "Document"}</ark.span>
          <ark.span>{props.kind === "documents" ? "Type" : "Status"}</ark.span>
          <ark.span>{props.kind === "projects" ? "Progress" : props.kind === "issues" ? "Priority" : "Owner"}</ark.span>
          <ark.span>Updated</ark.span><ark.span />
        </ark.div>
        <Listbox.Content class="collection-list">
          <For each={collection().items} fallback={<ark.div class="collection-empty"><Search size={24} /><ark.strong>No {props.kind} found</ark.strong><ark.p>Try another name, status, or owner.</ark.p></ark.div>}>
            {item => <Listbox.Item item={item} class={`collection-row ${props.kind}-columns`}>
              <ark.div class="item-primary">
                <ark.div class={`item-icon ${props.kind}`}><Icon size={17} /></ark.div>
                <ark.div class="item-copy"><Listbox.ItemText class="item-title">{item.title}</Listbox.ItemText><ark.span class="item-subtitle">{props.kind === "projects" ? `${item.code} · ${item.owner}` : props.kind === "issues" ? `${item.code} · ${projectName(item)}` : `${projectName(item)} · ${formatSize(item.size ?? 0)}`}</ark.span></ark.div>
              </ark.div>
              <ark.div class="item-status"><ark.span class={`badge ${statusTone(item.status)}`}>{props.kind === "documents" ? item.fileType : item.status}</ark.span></ark.div>
              <ark.div class="item-meta">
                <Show when={props.kind === "projects"} fallback={<ark.span classList={{ "priority-high": item.priority === "High" || item.priority === "Urgent" }}>{props.kind === "issues" ? item.priority : item.owner}</ark.span>}>
                  <Progress.Root value={item.progress ?? 0} class="item-progress">
                    <Progress.Label class="sr-only">{item.title} progress</Progress.Label>
                    <Progress.Track><Progress.Range /></Progress.Track><Progress.ValueText />
                  </Progress.Root>
                </Show>
              </ark.div>
              <ark.span class="item-updated">{formatDate(item.updatedAt)}</ark.span>
              <ArrowUpRight size={15} class="item-open" />
            </Listbox.Item>}
          </For>
        </Listbox.Content>
        <ark.div class="collection-footer"><ark.span role="status">Showing {collection().items.length} of {items().length} {props.kind}</ark.span><ark.span class="keyboard-hint">↑ ↓ to navigate · Enter to open</ark.span></ark.div>
      </Listbox.Root>
    </ark.section>
  );
}
