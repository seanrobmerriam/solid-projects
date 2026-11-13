import { describe, expect, spyOn, test } from "bun:test";
import { deploy } from "../../scripts/deploy.mjs";

const config = {
  baseUrl: "https://dokploy.example.test", applicationId: "app", apiKey: "secret",
  appUrl: "https://app.example.test", sha: "a".repeat(40), runId: "123-1"
};

function fixture(statuses = ["running", "done"], overrides = {}) {
  const calls = [];
  let poll = 0;
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (String(url).includes("application.one")) return Response.json({
      branch: "production", autoDeploy: false, buildType: "railpack", ...overrides
    });
    if (String(url).includes("application.deploy")) return Response.json({});
    if (String(url).includes("deployment.all")) return Response.json([
      { title: "old", status: "done" },
      { title: `GitHub ${config.runId}: ${config.sha}`, status: statuses[Math.min(poll++, statuses.length - 1)] }
    ]);
    return Response.json({ status: "ok" });
  };
  return { calls, fetcher, sleep: async () => {}, maxAttempts: 3 };
}

describe("Dokploy deployment gate", () => {
  test("inspection prints presence of required keys without values or a deployment", async () => {
    const io = fixture(["done"], { branch: "main", env: "SESSION_SECRET=private-value\nDISCORD_SECRET=private-discord" });
    const output = [];
    const log = spyOn(console, "log").mockImplementation(value => output.push(value));
    try {
      await deploy({ ...config, inspect: true }, io);
      expect(output.join("")).not.toContain("private-value");
      expect(output.join("")).not.toContain("private-discord");
      expect(JSON.parse(output[0]).configured.SESSION_SECRET).toBe(true);
      expect(io.calls).toHaveLength(1);
    } finally { log.mockRestore(); }
  });
  test("preflight prevents promotion while a prior deployment is unfinished", async () => {
    const io = fixture(["running"]);
    await expect(deploy({ ...config, preflight: true }, io)).rejects.toThrow("unfinished");
    expect(io.calls.some(c => c.url.includes("application.deploy"))).toBe(false);
  });
  test("preflight accepts an idle application without triggering deployment", async () => {
    const io = fixture(["done"]);
    await deploy({ ...config, preflight: true }, io);
    expect(io.calls).toHaveLength(2);
  });
  test("resolves Dokploy app names to API application IDs", async () => {
    const io = fixture(["done"]);
    const original = io.fetcher;
    io.fetcher = async (url, options) => {
      if (String(url).includes("application.one") && String(url).includes("appName")) {
        return new Response("not found", { status: 404 });
      }
      if (String(url).includes("project.all")) return Response.json([
        { environments: [{ applications: [{ appName: "appName", applicationId: "actual-id" }] }] }
      ]);
      return original(url, options);
    };
    await deploy({ ...config, applicationId: "appName" }, io);
    expect(JSON.parse(io.calls.find(c => c.url.includes("application.deploy")).body).applicationId).toBe("actual-id");
  });
  test("resolves app names when project.all omits appName", async () => {
    const io = fixture(["done"]);
    const original = io.fetcher;
    io.fetcher = async (url, options) => {
      if (String(url).includes("application.one") && String(url).includes("appName")) return new Response("not found", { status: 404 });
      if (String(url).includes("project.all")) return Response.json([{ projectId: "project", environments: [{ applications: [{ applicationId: "actual-id", name: "Frontend" }] }] }]);
      if (String(url).includes("project.one")) return Response.json({ projectId: "project", environments: [{ applications: [{ applicationId: "actual-id", appName: "appName" }] }] });
      return original(url, options);
    };
    await deploy({ ...config, applicationId: "appName" }, io);
    expect(JSON.parse(io.calls.find(c => c.url.includes("application.deploy")).body).applicationId).toBe("actual-id");
  });
  test("waits for the matching deployment before checking health", async () => {
    const io = fixture();
    await deploy(config, io);
    expect(io.calls.filter(c => c.url.includes("deployment.all"))).toHaveLength(2);
    expect(io.calls.at(-1).url).toBe(`${config.appUrl}/api/health`);
    expect(io.calls.at(-1).headers).toBeUndefined();
    expect(JSON.parse(io.calls.find(c => c.url.includes("application.deploy")).body).applicationId).toBe("app");
  });
  for (const status of ["error", "cancelled", "unexpected"]) {
    test(`fails on ${status}`, async () => {
      await expect(deploy(config, fixture([status]))).rejects.toThrow();
    });
  }
  test("times out rather than accepting an older successful deployment", async () => {
    await expect(deploy(config, fixture(["running"])) ).rejects.toThrow("Timed out");
  });
  for (const overrides of [{ branch: "main" }, { autoDeploy: true }, { buildType: "dockerfile" }]) {
    test(`rejects unsafe configuration ${JSON.stringify(overrides)}`, async () => {
      const io = fixture(["done"], overrides);
      await expect(deploy(config, io)).rejects.toThrow();
      expect(io.calls).toHaveLength(1);
    });
  }
  test("rejects missing credentials before making requests", async () => {
    const io = fixture();
    await expect(deploy({ ...config, apiKey: "" }, io)).rejects.toThrow();
    expect(io.calls).toHaveLength(0);
  });
  test("rejects insecure URLs", async () => {
    await expect(deploy({ ...config, baseUrl: "http://example.test" }, fixture())).rejects.toThrow();
  });
  test("HTTP failures omit response bodies that might contain credentials", async () => {
    await expect(deploy(config, { fetcher: async () => new Response("sensitive", { status: 401 }) }))
      .rejects.toThrow("Dokploy application.one failed (HTTP 401)");
  });
  test("fails when the new deployment is done but public health is unhealthy", async () => {
    const io = fixture(["done"]);
    const original = io.fetcher;
    io.fetcher = (url, options) => String(url).includes("/api/health")
      ? Promise.resolve(new Response("bad", { status: 503 })) : original(url, options);
    await expect(deploy(config, io)).rejects.toThrow("health");
  });
});
