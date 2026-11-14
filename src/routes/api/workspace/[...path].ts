import type { APIEvent } from "@solidjs/start/server";
import { functionBaseUrl } from "@neon/env";
import { requireUser, getAuth } from "~/auth/server";
import { createItem, readCreationForm, ensureWorkspace, findDocument, readCollections, removeItem, verifyMutationOrigin, verifyPageUser, WorkspaceError } from "~/server/workspace";
import { sealWorkspace } from "~/server/realtime";
import { downloadDocument } from "~/server/storage";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
async function handle({ request }: APIEvent) {
  try {
    const user = await requireUser(request);
    verifyPageUser(request, user.id);
    const path = new URL(request.url).pathname.replace(/^\/api\/workspace\/?/, "");
    if (request.method === "POST" || request.method === "DELETE") verifyMutationOrigin(request);
    if (request.method === "GET" && path === "summary") {
      const result = await getAuth(request).token();
      if (!result.data?.token) throw new WorkspaceError(401, "Sign in to continue");
      const response = await fetch(functionBaseUrl("summary"), { headers: { Authorization: `Bearer ${result.data.token}` }, signal: AbortSignal.timeout(15_000) });
      // The app session is already verified. A function configuration/availability
      // error must not sign a valid browser session out.
      if (!response.ok) throw new WorkspaceError(503, "Workspace summary is unavailable");
      return json(await response.json());
    }
    const download = /^documents\/([^/]+)\/file$/.exec(path);
    if (request.method === "GET" && download) {
      const file = await findDocument(user.id, decodeURIComponent(download[1]));
      return await downloadDocument(file.storage_key!, file.filename!);
    }
    const workspaceId = await ensureWorkspace(user.id);
    if (request.method === "GET" && path === "") return json({ workspaceId, userId: user.id,
      collections: await readCollections(user.id, workspaceId), realtime: await sealWorkspace(user.id, workspaceId) });
    if (request.method === "GET" && path === "live") return json({ ...await sealWorkspace(user.id, workspaceId), userId: user.id });
    if (request.method === "POST" && path === "items") {
      const form = await readCreationForm(request);
      return json(await createItem(user, workspaceId, form), 201);
    }
    const removal = /^items\/([^/]+)$/.exec(path);
    if (request.method === "DELETE" && removal) return json(await removeItem(user.id, workspaceId, decodeURIComponent(removal[1])));
    throw new WorkspaceError(404, "Endpoint not found");
  } catch (error) {
    if (error instanceof WorkspaceError) return json({ error: error.message }, error.status);
    if (error instanceof Response && error.status >= 400 && error.status < 500) return json({ error: error.status === 401 ? "Sign in to continue" : "Request denied" }, error.status);
    console.error("Workspace request failed");
    return json({ error: "Workspace is temporarily unavailable" }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
