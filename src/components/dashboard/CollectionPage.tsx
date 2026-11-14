import { ark } from "@ark-ui/solid/factory";
import { For, Show } from "solid-js";
import CollectionPanel from "./CollectionPanel";
import { useWorkspace } from "./WorkspaceContext";
import { singular, type CollectionKind } from "./data";

const descriptions = {
  projects: "Keep the bigger picture in focus. Every initiative, from first idea to final delivery.",
  issues: "Turn the things that need attention into the next things you ship.",
  tasks: "Keep track of the next steps that move your work forward.",
  agents: "A shared home for the assistants supporting your team’s work.",
  documents: "A shared home for the decisions, plans, and knowledge behind your work.",
};
const statDefinitions = {
  projects: [{ label: "In progress", status: "In progress" }, { label: "In planning", status: "Planning" }, { label: "Completed", status: "Completed" }],
  issues: [{ label: "Open issues", status: "Open" }, { label: "In progress", status: "In progress" }, { label: "Resolved", status: "Resolved" }],
  tasks: [{ label: "Open tasks", status: "Open" }, { label: "In progress", status: "In progress" }, { label: "Completed", status: "Completed" }],
  agents: [{ label: "Active", status: "Active" }, { label: "Idle", status: "Idle" }, { label: "Paused", status: "Paused" }],
  documents: [{ label: "Published", status: "Published" }, { label: "In review", status: "In review" }, { label: "Drafts", status: "Draft" }],
};

export default function CollectionPage(props: { kind: CollectionKind }) {
  const workspace = useWorkspace();
  const title = () => `All ${props.kind[0].toUpperCase()}${props.kind.slice(1)}`;
  return (
    <ark.div class="collection-page">
      <ark.section class="page-summary">
        <ark.div class="page-heading"><ark.div><ark.h2>{title()}</ark.h2><ark.p>{descriptions[props.kind]}</ark.p></ark.div><Show when={props.kind !== "tasks" && props.kind !== "agents"}><ark.button class="button primary" onClick={() => workspace.setCreateKind(props.kind)}>+ {singular[props.kind]}</ark.button></Show></ark.div>
        <ark.div class="summary-stats"><For each={statDefinitions[props.kind]}>{stat => <ark.div class="summary-stat"><ark.span>{stat.label}</ark.span><ark.strong>{workspace.collections[props.kind].filter(item => item.status === stat.status).length}</ark.strong></ark.div>}</For></ark.div>
        <ark.p class="summary-note">Select an item below to see its details. Use the filter to find a name, owner, or status.</ark.p>
      </ark.section>
      <CollectionPanel kind={props.kind} />
    </ark.div>
  );
}
