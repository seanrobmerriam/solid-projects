import { ark } from "@ark-ui/solid/factory";
import CollectionPanel from "~/components/dashboard/CollectionPanel";
import { useWorkspace } from "~/components/dashboard/WorkspaceContext";

export default function Overview() {
  const workspace = useWorkspace();
  return (
    <ark.div class="overview-page">
      <ark.div class="overview-heading"><ark.div><ark.h2>Make room for what matters.</ark.h2><ark.p>Here's where things stand across your workspace.</ark.p></ark.div><ark.span class="overview-total">{workspace.collections.projects.length} projects<ark.span />{workspace.collections.issues.filter(item => item.status !== "Resolved").length} current issues</ark.span></ark.div>
      <CollectionPanel kind="issues" heading currentOnly />
      <CollectionPanel kind="projects" heading />
    </ark.div>
  );
}
