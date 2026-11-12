import { ark } from "@ark-ui/solid/factory";
import type { ParentProps } from "solid-js";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";
import WorkspaceDialogs from "./WorkspaceDialogs";
import { useWorkspace } from "./WorkspaceContext";
import "./dashboard.css";

export default function DashboardLayout(props: ParentProps) {
  const workspace = useWorkspace();
  return (
    <ark.div class="dashboard-shell">
      <ark.a href="#dashboard-content" class="skip-link">Skip to content</ark.a>
      <Sidebar />
      <ark.div class="dashboard-workspace">
        <Toolbar />
        <ark.main class="dashboard-main" id="dashboard-content" tabIndex={-1}>{props.children}</ark.main>
        <ark.footer class="workspace-footer"><ark.span><ark.span class="live-dot" />All systems ready</ark.span><ark.span>Sample workspace · Changes reset on reload</ark.span></ark.footer>
      </ark.div>
      <WorkspaceDialogs />
      <ark.div class="sr-only" role="status" aria-live="polite">{workspace.announcement()}</ark.div>
    </ark.div>
  );
}
