import { describe, expect, test } from "bun:test";
import { databaseConfig } from "../../src/server/db";
import { safeFilename, MAX_FILE_BYTES } from "../../src/server/storage";
import { verifyMutationOrigin, verifyPageUser, validateCreation, readCreationForm } from "../../src/server/workspace";
import { WORKSPACE_LIVE_SQL } from "../../src/server/realtime";
import { initialCollections } from "../../src/components/dashboard/data";

function form(kind = "documents", title = "  New document  ", description = "  Description  ") {
  const value = new FormData();
  value.set("kind", kind); value.set("title", title); value.set("description", description);
  return value;
}
describe("workspace boundaries", () => {
  test("requires verified TLS even when a connection URL requests weaker TLS", () => {
    const config = databaseConfig("postgresql://user:password@example.com/db?sslmode=require&uselibpqcompat=true");
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
    expect(config.connectionString).not.toContain("sslmode");
    expect(config.max).toBe(8);
  });
  test("stale pages cannot write or renew into a different account", () => {
    expect(() => verifyPageUser(new Request("https://app.test", { headers: { "x-workspace-user": "old" } }), "new")).toThrow("session changed");
    expect(() => verifyPageUser(new Request("https://app.test", { headers: { "x-workspace-user": "same" } }), "same")).not.toThrow();
  });
  test("mutation origins fail closed for missing and forged values", () => {
    const previous = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://app.test";
    try {
      expect(() => verifyMutationOrigin(new Request("https://app.test/api/workspace/items"))).toThrow("origin");
      expect(() => verifyMutationOrigin(new Request("https://app.test/api/workspace/items", { headers: { origin: "https://evil.test" } }))).toThrow("origin");
      expect(() => verifyMutationOrigin(new Request("https://app.test/api/workspace/items", { headers: { origin: "https://app.test" } }))).not.toThrow();
      expect(() => verifyMutationOrigin(new Request("http://internal:3000/api/workspace/items", { headers: { origin: "https://app.test" } }))).not.toThrow();
      delete process.env.APP_ORIGIN;
      expect(() => verifyMutationOrigin(new Request("https://app.test/api/workspace/items", { headers: { origin: "https://app.test" } }))).toThrow("origin");
    } finally { if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; }
  });
  test("validates and normalizes title, description and collection", () => {
    expect(validateCreation(form())).toMatchObject({ kind: "documents", title: "New document", description: "Description" });
    for (const invalid of [form("unknown"), form("issues", " "), form("issues", "a".repeat(161)), form("issues", "title", "x".repeat(2001))]) {
      expect(() => validateCreation(invalid)).toThrow();
    }
  });
  test("rejects file fields outside documents and files above ten MiB", () => {
    const project = form("projects"); project.set("file", new File(["x"], "file.txt"));
    expect(() => validateCreation(project)).toThrow("Only documents");
    const oversized = form(); oversized.set("file", new File([new Uint8Array(MAX_FILE_BYTES + 1)], "file.txt"));
    expect(() => validateCreation(oversized)).toThrow("10 MiB");
    const valid = form(); valid.set("file", new File(["text"], "file.txt"));
    expect(validateCreation(valid).file?.size).toBe(4);
  });
  test("limits chunked uploads before multipart parsing", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled = true; },
    });
    const request = new Request("https://app.test/api/workspace/items", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readCreationForm(request)).rejects.toThrow("Upload is too large");
    expect(cancelled).toBe(true);
    const valid = new Request("https://app.test/api/workspace/items", { method: "POST", body: form() });
    expect((await readCreationForm(valid)).get("title")).toBe("  New document  ");
  });
  test("private download names cannot inject headers or paths", () => {
    expect(safeFilename('../../secret.txt')).toBe("secret.txt");
    expect(safeFilename('folder\\evil\r\n".html')).toBe("evil___.html");
    expect(safeFilename("...")).toBe("document");
  });
  test("live SQL includes both membership and workspace constraints", () => {
    expect(WORKSPACE_LIVE_SQL).toContain("JOIN workspace_members");
    expect(WORKSPACE_LIVE_SQL).toContain("m.user_id = $1 AND i.workspace_id = $2");
    expect(WORKSPACE_LIVE_SQL).not.toContain(";");
  });
  test("baseline seeds remain complete", () => {
    expect(initialCollections.projects).toHaveLength(12);
    expect(initialCollections.issues).toHaveLength(36);
    expect(initialCollections.documents).toHaveLength(50);
  });
});
