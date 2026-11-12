import { Avatar } from "@ark-ui/solid/avatar";
import { Collapsible } from "@ark-ui/solid/collapsible";
import { ark } from "@ark-ui/solid/factory";
import { Menu } from "@ark-ui/solid/menu";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { ChevronRight, CircleDot, FileText, FolderKanban, LayoutDashboard, Layers, LogOut, X } from "lucide-solid";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { useAuth } from "~/components/Context";
import { useWorkspace } from "./WorkspaceContext";
import { views, viewPath, type CollectionKind, type View } from "./data";

const icons = { overview: LayoutDashboard, projects: FolderKanban, issues: CircleDot, documents: FileText };

export default function Sidebar() {
  const workspace = useWorkspace();
  const { session, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = createSignal(false);
  onMount(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    onCleanup(() => media.removeEventListener("change", update));
  });
  const isActive = (view: View) => location.pathname === viewPath(view);

  // Ark Menu uses vertical keyboard navigation by default. Keep that intent
  // on the root configuration and explicitly expose it on the menu content.
  const menuProps = { orientation: "vertical" as const, open: true, closeOnSelect: false, loopFocus: true };

  return (
    <>
      <Show when={workspace.sidebarOpen()}>
        <ark.button class="sidebar-scrim" aria-label="Close sidebar" onClick={() => workspace.setSidebarOpen(false)} />
      </Show>
      <ark.aside class="sidebar" classList={{ "is-open": workspace.sidebarOpen() }} inert={isMobile() && !workspace.sidebarOpen()}>
        <ark.div class="sidebar-brand">
          <ark.div class="brand-mark"><Layers size={19} /></ark.div>
          <ark.span>Workspace</ark.span>
          <ark.button class="icon-button mobile-only" aria-label="Close sidebar" onClick={() => workspace.setSidebarOpen(false)}><X size={18} /></ark.button>
        </ark.div>
        <ark.div class="workspace-label"><ark.span class="workspace-dot" /> Team workspace</ark.div>
        <ark.nav aria-label="Workspace" class="sidebar-nav">
          <ark.p class="nav-label">Workspace</ark.p>
          <Menu.Root
            {...menuProps}
            navigate={({ href }) => { navigate(href); workspace.setSidebarOpen(false); }}
            onInteractOutside={event => event.preventDefault()}
            onEscapeKeyDown={event => { event.preventDefault(); workspace.setSidebarOpen(false); }}
          >
            <Menu.Content aria-label="Workspace views" aria-orientation="vertical" class="sidebar-menu">
              <For each={views}>
                {view => {
                  const Icon = icons[view.value];
                  const kind = () => view.value as CollectionKind;
                  const link = () => (
                    <Menu.Item
                      value={view.value}
                      valueText={view.label}
                      class="sidebar-link"
                      classList={{ active: isActive(view.value) }}
                      asChild={props => <A {...props()} href={viewPath(view.value)} aria-current={isActive(view.value) ? "page" : undefined}>
                        <Icon size={18} />
                        <ark.span>{view.label}</ark.span>
                        <Show when={view.value !== "overview"}><ark.span class="nav-count">{workspace.collections[kind()]?.length}</ark.span></Show>
                      </A>}
                    />
                  );
                  return (
                    <Show when={view.value !== "overview"} fallback={link()}>
                      <Collapsible.Root>
                        <ark.div class="sidebar-group-row">
                          {link()}
                          <Collapsible.Trigger class="expand-button" aria-label={`Expand ${view.label}`}>
                            <ChevronRight size={14} />
                          </Collapsible.Trigger>
                        </ark.div>
                        <Collapsible.Content class="sidebar-children">
                          <For each={workspace.collections[kind()]}>
                            {item => <Menu.Item
                              value={item.id}
                              valueText={item.title}
                              class="sidebar-child"
                              onSelect={() => workspace.setSelected({ kind: kind(), item })}
                              asChild={props => <A {...props()} href={viewPath(view.value)}><ark.span class="child-dot" /><ark.span>{item.title}</ark.span></A>}
                            />}
                          </For>
                        </Collapsible.Content>
                      </Collapsible.Root>
                    </Show>
                  );
                }}
              </For>
            </Menu.Content>
          </Menu.Root>
        </ark.nav>
        <ark.div class="sidebar-note"><ark.span class="mock-indicator" /> Sample workspace<ark.p>Explore with realistic demo data.</ark.p></ark.div>
        <ark.div class="sidebar-account">
          <Avatar.Root class="avatar"><Avatar.Fallback>{session()?.email?.slice(0, 2).toUpperCase()}</Avatar.Fallback></Avatar.Root>
          <ark.div class="account-info"><ark.strong>My account</ark.strong><ark.span title={session()?.email}>{session()?.email}</ark.span></ark.div>
          <ark.form action={logout} method="post"><ark.button type="submit" class="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={17} /></ark.button></ark.form>
        </ark.div>
      </ark.aside>
    </>
  );
}
