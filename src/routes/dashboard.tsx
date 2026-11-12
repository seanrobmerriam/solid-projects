import { useLocation, type RouteDefinition } from "@solidjs/router";
import { Show, type ParentProps } from "solid-js";
import { querySession } from "~/auth";
import { useAuth } from "~/components/Context";
import DashboardLayout from "~/components/dashboard/DashboardLayout";
import { WorkspaceProvider } from "~/components/dashboard/WorkspaceContext";

export const route: RouteDefinition = {
  preload: ({ location }) => querySession(location.pathname),
};

export default function Dashboard(props: ParentProps) {
  const location = useLocation();
  const { signedIn } = useAuth();
  const isSignIn = () => location.pathname.replace(/\/+$/, "") === "/dashboard";
  return (
    <Show when={!isSignIn()} fallback={props.children}>
      <Show when={signedIn()}>
        <WorkspaceProvider><DashboardLayout>{props.children}</DashboardLayout></WorkspaceProvider>
      </Show>
    </Show>
  );
}
