import { type RouteDefinition, Router, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { MetaProvider, Title } from "@solidjs/meta";
import { Show, Suspense } from "solid-js";
import { querySession } from "./auth";
import Auth from "./components/Context";
import Nav from "./components/Nav";
import ErrorNotification from "./components/Error";
import "./app.css";

export const route: RouteDefinition = {
  preload: ({ location }) => querySession(location.pathname)
};

function WorkspaceTitle() {
  const location = useLocation();
  const title = () => {
    const view = location.pathname.replace(/\/+$/, "").split("/").pop();
    if (view === "overview") return "Overview";
    if (view === "projects") return "All Projects";
    if (view === "issues") return "All Issues";
    if (view === "documents") return "All Documents";
    return "Sign in";
  };
  return <Show when={location.pathname.startsWith("/dashboard") || location.pathname === "/login"}><Title>{title()} · Workspace</Title></Show>;
}

export default function App() {
  return (
    <Router
      root={props => (
        <MetaProvider>
          <WorkspaceTitle />
          <Auth>
            <Suspense>
              <Nav />
              {props.children}
              <ErrorNotification />
            </Suspense>
          </Auth>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
