import { createContext, createSignal, onCleanup, onMount, useContext, type ParentProps } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createStore } from "solid-js/store";
import { createRealtimeClient, type SealedLiveQuery } from "@neon/realtime/client";
import { type CollectionKind, type SavedCollectionKind, type WorkspaceItem } from "./data";
import { useAuth } from "~/components/Context";

type WorkspaceRow = { workspace_id: string; id: string; kind: SavedCollectionKind; data: WorkspaceItem };
type LiveCapability = { url: string; sealedQuery: SealedLiveQuery<WorkspaceRow>; userId: string };
type Collections = Record<CollectionKind, WorkspaceItem[]>;
type WorkspaceSummary = { projects: number; issues: number; documents: number; files: number };

function createWorkspace() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [collections, setCollections] = createStore<Collections>({
    projects: [], issues: [], documents: [],
    tasks: [],
    agents: [],
  });
  const [filters, setFilters] = createStore({ projects: "", issues: "", documents: "", tasks: "", agents: "" });
  const [createKind, setCreateKind] = createSignal<CollectionKind | null>(null);
  const [selected, setSelected] = createSignal<{ kind: CollectionKind; item: WorkspaceItem } | null>(null);
  const [activeRun, setActiveRun] = createSignal<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [announcement, setAnnouncement] = createSignal("");
  const [status, setStatus] = createSignal("Loading workspace…");
  const [error, setError] = createSignal("");
  const [ready, setReady] = createSignal(false);
  const [summary, setSummary] = createSignal<WorkspaceSummary>();
  const [summaryUnavailable, setSummaryUnavailable] = createSignal(false);
  let userId = "";
  let disposed = false;
  let blocked = false;
  let retryDelay = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let client: ReturnType<typeof createRealtimeClient> | undefined;
  let subscription: ReturnType<ReturnType<typeof createRealtimeClient>["subscribe"]> | undefined;
  const requests = new AbortController();

  function stopLive() {
    clearTimeout(timer);
    subscription?.unsubscribe();
    subscription = undefined;
    client?.close();
    client = undefined;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init, signal: requests.signal, credentials: "same-origin", cache: "no-store",
      headers: { ...(userId ? { "x-workspace-user": userId } : {}), ...init.headers },
    });
    if (response.status === 401 || response.status === 409) {
      blocked = true;
      stopLive();
      setCollections({ projects: [], issues: [], documents: [], tasks: [], agents: [] });
      window.location.assign("/dashboard");
      throw new Error("Your session changed. Returning to sign in…");
    }
    if (response.status === 403) {
      blocked = true;
      stopLive();
      setCollections({ projects: [], issues: [], documents: [], tasks: [], agents: [] });
      setReady(false);
      throw new Error("You no longer have access to this workspace.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      throw new Error(body?.message || body?.error || "Could not load or save the workspace. Please try again.");
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("The workspace service returned an unexpected response. Please reload to retry.");
    }
    return response.json() as Promise<T>;
  }

  async function refreshSummary() {
    try {
      const value = await request<WorkspaceSummary>("/api/workspace/summary");
      if (!disposed && !blocked) { setSummary(value); setSummaryUnavailable(false); }
    } catch {
      if (!disposed) setSummaryUnavailable(true);
    }
  }

  async function freshCapability() {
    const result = await request<LiveCapability>("/api/workspace/live");
    if (result.userId !== userId) {
      blocked = true;
      stopLive();
      setCollections({ projects: [], issues: [], documents: [], tasks: [], agents: [] });
      window.location.assign("/dashboard");
      throw new Error("Your session changed. Returning to sign in…");
    }
    return result;
  }

  function recover() {
    if (disposed || blocked) return;
    stopLive();
    setStatus("Live updates disconnected · reconnecting…");
    timer = setTimeout(async () => {
      try { const capability = await freshCapability(); if (!disposed && !blocked) connect(capability); }
      catch (cause) {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : "Live updates unavailable.");
        recover();
      }
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }

  function scheduleRenewal(capability: LiveCapability) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const next = await freshCapability();
        if (disposed || blocked || !subscription) return;
        await subscription.renew(next.sealedQuery);
        scheduleRenewal(next);
      } catch (cause) {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : "Live updates unavailable.");
        recover();
      }
    }, Math.max(0, capability.sealedQuery.expiresAt - Date.now() - 10000));
  }

  function connect(capability: LiveCapability) {
    stopLive();
    client = createRealtimeClient({ url: capability.url });
    const current = client.subscribe(capability.sealedQuery);
    subscription = current;
    const applySnapshot = (snapshot: ReturnType<typeof current.getSnapshot>) => {
      if (disposed || subscription !== current || snapshot.data === undefined) return;
      const next: Collections = { projects: [], issues: [], documents: [], tasks: [], agents: [] };
      for (const row of snapshot.data) {
        if (row.kind in next) next[row.kind].push(row.data);
      }
      setCollections(next);
      setReady(true);
    };
    current.onChange(applySnapshot);
    applySnapshot(current.getSnapshot());
    current.onStateChange(state => {
      if (disposed || subscription !== current) return;
      if (state.status === "live") {
        retryDelay = 1000;
        setError("");
        setStatus("Live updates connected");
      } else if (state.status === "error") recover();
      else if (state.status === "stale") setStatus("Reconnecting · saved data may be out of date");
      else if (state.status === "connecting") setStatus("Connecting live updates…");
    });
    scheduleRenewal(capability);
  }

  onMount(async () => {
    userId = session()?.id ?? "";
    try {
      const result = await request<{ userId: string; collections: Record<SavedCollectionKind, WorkspaceItem[]>; realtime: Omit<LiveCapability, "userId"> }>("/api/workspace");
      if (disposed || blocked) return;
      if (userId && result.userId !== userId) {
        blocked = true;
        window.location.assign("/dashboard");
        return;
      }
      userId = result.userId;
      setCollections(result.collections);
      setReady(true);
      connect({ ...result.realtime, userId });
      void refreshSummary();
    } catch (cause) {
      if (disposed) return;
      setError(cause instanceof Error ? cause.message : "Could not load the workspace.");
      setStatus("Workspace unavailable · reload to retry");
    }
  });
  onCleanup(() => { disposed = true; stopLive(); requests.abort(); });

  async function addItem(kind: CollectionKind, title: string, description: string, _owner: string, file?: File, options?: { projectId?: string; requestId?: string }) {
    if (!ready() || !userId || blocked) throw new Error("Wait for the workspace to finish loading.");
    if (kind === "tasks" || kind === "agents") throw new Error("Use the default agent settings; task creation is not enabled yet.");
    const body = new FormData();
    body.set("kind", kind); body.set("title", title); body.set("description", description);
    if (file) body.set("file", file);
    if (options?.projectId) body.set("projectId", options.projectId);
    if (options?.requestId) body.set("requestId", options.requestId);
    const result = await request<{ item: WorkspaceItem; txid?: string }>("/api/workspace/items", { method: "POST", body });
    if (disposed || blocked) return;
    // The write is committed. Prefer the subscribed snapshot; if delivery is delayed,
    // include the returned row so the saved record is immediately discoverable.
    if (result.txid && subscription) await subscription.awaitTxId(result.txid, 5000).catch(() => undefined);
    if (disposed || blocked) return;
    setCollections(kind, items => items.some(item => item.id === result.item.id) ? items : [result.item, ...items]);
    setFilters(kind, "");
    setCreateKind(null);
    setAnnouncement(`${title} saved to your workspace.`);
    void refreshSummary();
    if (result.item.runId) setActiveRun(result.item.runId);
    return result.item;
  }

  return {
    collections, filters, createKind, setCreateKind, selected,
    setSelected: (value: { kind: CollectionKind; item: WorkspaceItem } | null) => {
      if (value?.kind === "projects") { navigate(`/dashboard/projects/${encodeURIComponent(value.item.id)}`); setSelected(null); }
      else setSelected(value);
    }, addItem, request, activeRun, setActiveRun, userId: () => session()?.id,
    sidebarOpen, setSidebarOpen, announcement, status, error, ready,
    savedStatus: () => {
      if (summaryUnavailable()) return "Saved workspace · summary unavailable";
      const counts = summary();
      return counts ? `${counts.projects + counts.issues + counts.documents} saved records · ${counts.files} files` : "Saved to your workspace";
    },
    setFilter: (kind: CollectionKind, value: string) => setFilters(kind, value),
    clearFilters: () => setFilters({ projects: "", issues: "", documents: "", tasks: "", agents: "" }),
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
