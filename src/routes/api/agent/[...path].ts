import type { APIEvent } from "@solidjs/start/server";
import { requireUser } from "~/auth/server";
import { ensureWorkspace, readCreationForm, verifyMutationOrigin, verifyPageUser, WorkspaceError } from "~/server/workspace";
import { agentSettings, saveAgentSettings, projectDetail, findRun, runEvents } from "~/server/agents/store";
import { kickWorkspace } from "~/server/agents/dispatcher";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
async function handle({ request }: APIEvent) {
  try {
    const user = await requireUser(request);
    verifyPageUser(request, user.id);
    const url = new URL(request.url);
    if (url.searchParams.has("user") && url.searchParams.get("user") !== user.id) throw new WorkspaceError(409, "Your session changed. Reload this page.");
    const path = url.pathname.replace(/^\/api\/agent\//, "");
    if (request.method !== "GET") verifyMutationOrigin(request);
    const workspaceId = await ensureWorkspace(user.id);
    if (path === "settings" && request.method === "GET") return json(await agentSettings(workspaceId));
    if (path === "settings" && request.method === "PUT") {
      // Reuse the bounded body reader, with stricter limits for settings.
      if (Number(request.headers.get("content-length")) > 192 * 1024) throw new WorkspaceError(413, "Settings are too large");
      const form = await readCreationForm(request, 192 * 1024);
      return json(await saveAgentSettings(workspaceId, { prompt: form.get("prompt"), instructions: form.get("instructions") }));
    }
    const project = /^projects\/([a-zA-Z0-9-]+)$/.exec(path);
    if (request.method === "GET" && project) { const result = await projectDetail(workspaceId, project[1]); kickWorkspace(workspaceId); return json(result); }
    const match = /^runs\/([a-f0-9-]+)(\/events)?$/i.exec(path);
    if (request.method === "GET" && match) {
      const run = await findRun(workspaceId, match[1]);
      kickWorkspace(workspaceId);
      if (!match[2]) return json({ run, events: await runEvents(run.id) });
      let after = Number(request.headers.get("last-event-id") || url.searchParams.get("after") || 0);
      if (!Number.isSafeInteger(after) || after < 0) throw new WorkspaceError(400, "Invalid stream position");
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => { stopped = true; if (timer) clearTimeout(timer); request.signal.removeEventListener("abort", stop); };
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          request.signal.addEventListener("abort", stop, { once: true });
          let authAt = Date.now();
          const poll = async () => {
            if (stopped) return;
            try {
              if (Date.now() - authAt > 15_000) {
                const current = await requireUser(request);
                if (current.id !== user.id) throw new Error("Session changed");
                authAt = Date.now();
              }
              const allowed = await import("~/server/db").then(({ getPool }) => getPool().query("SELECT 1 FROM workspace_members WHERE user_id=$1 AND workspace_id=$2", [user.id, workspaceId]));
              if (!allowed.rows.length) throw new Error("Access revoked");
              const current = await findRun(workspaceId, run.id);
              const events = await runEvents(run.id, after);
              for (const event of events) {
                if (stopped) return;
                controller.enqueue(encoder.encode(`id: ${event.seq}\nevent: output\ndata: ${JSON.stringify(event)}\n\n`)); after = event.seq;
              }
              if (stopped) return;
              controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({ status: current.status })}\n\n`));
              if (!["Queued", "Running"].includes(current.status) && events.length < 200) {
                controller.enqueue(encoder.encode("event: done\ndata: {}\n\n")); controller.close(); stop(); return;
              }
              timer = setTimeout(() => { void poll(); }, events.length === 200 ? 0 : 750);
            } catch {
              if (!stopped) { controller.enqueue(encoder.encode('event: failure\ndata: {"error":"Output connection ended. Reload to check your session and reopen the run."}\n\n')); controller.close(); stop(); }
            }
          };
          void poll();
        },
        cancel: stop,
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" } });
    }
    throw new WorkspaceError(404, "Endpoint not found");
  } catch (error) {
    if (error instanceof WorkspaceError) return json({ error: error.message }, error.status);
    if (error instanceof Response && error.status === 401) return json({ error: "Sign in to continue" }, 401);
    console.error("Agent API request failed");
    return json({ error: "Agent service is temporarily unavailable" }, 503);
  }
}
export const GET = handle;
export const PUT = handle;
