import { useListCollection } from "@ark-ui/solid/collection";
import { Combobox } from "@ark-ui/solid/combobox";
import { ark } from "@ark-ui/solid/factory";
import { Menu } from "@ark-ui/solid/menu";
import { useLocation, useNavigate } from "@solidjs/router";
import { Check, ChevronDown, CircleDot, Eraser, FilePlus2, FolderPlus, Menu as MenuIcon, PanelLeft } from "lucide-solid";
import { For, createEffect, createSignal, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { useWorkspace } from "./WorkspaceContext";
import { views, viewPath } from "./data";

function ToolbarMenu(props: { label: string; children: JSX.Element }) {
  return (
    <Menu.Root positioning={{ placement: "bottom-start" }} lazyMount unmountOnExit>
      <Menu.Trigger class="toolbar-menu-trigger">{props.label}<ChevronDown size={12} /></Menu.Trigger>
      <Portal><Menu.Positioner><Menu.Content class="popup-menu" aria-label={props.label}>{props.children}</Menu.Content></Menu.Positioner></Portal>
    </Menu.Root>
  );
}

export default function Toolbar() {
  const workspace = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const current = () => views.find(view => location.pathname === viewPath(view.value)) ?? views[0];
  const [inputValue, setInputValue] = createSignal(current().label);
  const { collection, filter } = useListCollection({
    initialItems: views,
    itemToString: item => item.label,
    itemToValue: item => item.value,
    filter: (text, query) => text.toLowerCase().includes(query.trim().toLowerCase()),
  });
  createEffect(() => { setInputValue(current().label); filter(""); });

  return (
    <ark.header class="toolbar">
      <ark.button class="icon-button mobile-only" aria-label="Open sidebar" onClick={() => workspace.setSidebarOpen(true)}><PanelLeft size={19} /></ark.button>
      <ark.h1>{current().label}</ark.h1>
      <ark.div class="toolbar-divider" />
      <ark.div class="toolbar-menus" role="group" aria-label="View commands">
        <ToolbarMenu label="Actions">
          <Menu.Item value="new-project" onSelect={() => workspace.setCreateKind("projects")}><FolderPlus size={16} />New project</Menu.Item>
          <Menu.Item value="new-issue" onSelect={() => workspace.setCreateKind("issues")}><CircleDot size={16} />New issue</Menu.Item>
          <Menu.Item value="new-document" onSelect={() => workspace.setCreateKind("documents")}><FilePlus2 size={16} />New document</Menu.Item>
        </ToolbarMenu>
        <ToolbarMenu label="Edit">
          <Menu.Item value="clear-filters" onSelect={workspace.clearFilters}><Eraser size={16} />Clear filters</Menu.Item>
        </ToolbarMenu>
        <ToolbarMenu label="Views">
          <For each={views}>{view => <Menu.Item value={view.value} onSelect={() => navigate(viewPath(view.value))}>
            <ark.span>{view.label}</ark.span><Check size={14} classList={{ invisible: current().value !== view.value }} />
          </Menu.Item>}</For>
        </ToolbarMenu>
      </ark.div>
      <Combobox.Root
        class="view-combobox"
        collection={collection()}
        value={[current().value]}
        inputValue={inputValue()}
        onInputValueChange={details => { setInputValue(details.inputValue); filter(details.inputValue); }}
        onValueChange={details => { const view = views.find(item => item.value === details.value[0]); if (view) navigate(viewPath(view.value)); }}
        onOpenChange={details => { filter(""); if (!details.open) setInputValue(current().label); }}
        openOnClick
        positioning={{ placement: "bottom-end", sameWidth: true }}
        lazyMount unmountOnExit
      >
        <Combobox.Label class="sr-only">Current view</Combobox.Label>
        <Combobox.Control class="combobox-control">
          <MenuIcon size={15} class="combobox-icon" />
          <Combobox.Input placeholder="Switch view…" />
          <Combobox.Trigger aria-label="Choose view"><ChevronDown size={14} /></Combobox.Trigger>
        </Combobox.Control>
        <Portal><Combobox.Positioner><Combobox.Content class="popup-menu view-options">
          <Combobox.Empty class="combobox-empty">No matching views</Combobox.Empty>
          <For each={collection().items}>{item => <Combobox.Item item={item}>
            <Combobox.ItemText>{item.label}</Combobox.ItemText>
            <Combobox.ItemIndicator><Check size={14} /></Combobox.ItemIndicator>
          </Combobox.Item>}</For>
        </Combobox.Content></Combobox.Positioner></Portal>
      </Combobox.Root>
    </ark.header>
  );
}
