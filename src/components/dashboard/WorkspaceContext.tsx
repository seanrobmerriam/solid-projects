import { createContext, createSignal, useContext, type ParentProps } from "solid-js";
import { createStore } from "solid-js/store";
import { initialCollections, type CollectionKind, type WorkspaceItem } from "./data";

function createWorkspace() {
  // A fresh store per layout/request; mock edits deliberately reset on reload.
  const [collections, setCollections] = createStore<Record<CollectionKind, WorkspaceItem[]>>({
    projects: [...initialCollections.projects],
    issues: [...initialCollections.issues],
    documents: [...initialCollections.documents],
  });
  const [filters, setFilters] = createStore({ projects: "", issues: "", documents: "" });
  const [createKind, setCreateKind] = createSignal<CollectionKind | null>(null);
  const [selected, setSelected] = createSignal<{ kind: CollectionKind; item: WorkspaceItem } | null>(null);
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [announcement, setAnnouncement] = createSignal("");

  function addItem(kind: CollectionKind, title: string, description: string, owner: string) {
    const date = new Date().toISOString().slice(0, 10);
    const item: WorkspaceItem = {
      id: `${kind}-${crypto.randomUUID()}`, title, description, owner,
      status: kind === "projects" ? "Planning" : kind === "issues" ? "Open" : "Draft",
      updatedAt: date, tags: [],
      ...(kind === "projects" ? { progress: 0, code: "NEW" } : {}),
      ...(kind === "issues" ? { priority: "Medium", code: `NEW-${collections.issues.length + 101}` } : {}),
      ...(kind === "documents" ? { fileType: "MD", size: new TextEncoder().encode(description).length, version: "1.0", createdAt: date } : {}),
    };
    setCollections(kind, items => [item, ...items]);
    setFilters(kind, "");
    setCreateKind(null);
    setAnnouncement(`${title} created. Changes are kept until this page is reloaded.`);
  }

  return {
    collections, filters, createKind, setCreateKind, selected, setSelected, addItem,
    sidebarOpen, setSidebarOpen, announcement,
    setFilter: (kind: CollectionKind, value: string) => setFilters(kind, value),
    clearFilters: () => setFilters({ projects: "", issues: "", documents: "" }),
  };
}

const WorkspaceContext = createContext<ReturnType<typeof createWorkspace>>();

export function WorkspaceProvider(props: ParentProps) {
  return <WorkspaceContext.Provider value={createWorkspace()}>{props.children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("Workspace controls must be inside WorkspaceProvider");
  return workspace;
}
