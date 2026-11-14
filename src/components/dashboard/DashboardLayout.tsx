import { ark } from "@ark-ui/solid/factory";
import { Show, type ParentProps } from "solid-js";
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
        <ark.footer class="workspace-footer"><ark.span role="status"><ark.span class="live-dot" />{workspace.status()}</ark.span><ark.span><Show when={workspace.error()} fallback={workspace.savedStatus()}><ark.span role="alert">{workspace.error()}</ark.span></Show></ark.span></ark.footer>
      </ark.div>
      <WorkspaceDialogs />
      <ark.div class="sr-only" role="status" aria-live="polite">{workspace.announcement()}</ark.div>
    </ark.div>
  );
}
