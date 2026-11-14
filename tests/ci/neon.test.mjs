import { describe, expect, test } from "bun:test";
import { validateCiTarget, verifyEmptyDatabase } from "../../scripts/verify-ci-branch";
import { ciBranchName, prepareNeon, cleanupNeon, ENV_FILE, PROJECT_ID, TEMPLATE_BRANCH } from "../../scripts/ci-neon.mjs";

const env = { NEON_API_KEY: "unit-key", GITHUB_RUN_ID: "12345", GITHUB_RUN_ATTEMPT: "2" };
function fixture() {
  const calls = [];
  return { calls, env, now: () => new Date("2026-11-13T00:00:00Z"), cookieSecret: () => "ephemeral-secret",
    run: async args => calls.push(["run", args]), append: async (...args) => calls.push(["append", ...args]),
    remove: async (...args) => calls.push(["remove", ...args]), secure: async (...args) => calls.push(["secure", ...args]) };
}
describe("isolated Neon lifecycle", () => {
  test("only numeric run identities can select a branch; production overrides are ignored", () => {
    expect(ciBranchName({ ...env, NEON_BRANCH: "production" })).toBe("ci-12345-2");
    for (const value of [{}, { ...env, GITHUB_RUN_ID: "production" }, { ...env, GITHUB_RUN_ATTEMPT: "1 --branch production" }]) expect(() => ciBranchName(value)).toThrow();
  });
  test("creates from the empty template, pins expiry, and verifies isolation before tests", async () => {
    const io = fixture(); await prepareNeon(io);
    const runs = io.calls.filter(c => c[0] === "run").map(c => c[1]);
    expect(runs[0]).toEqual(["neon", "branches", "create", "--name", "ci-12345-2", "--parent", TEMPLATE_BRANCH, "--expires-at", "2026-11-14T00:00:00.000Z", "--no-secrets", "--project-id", PROJECT_ID]);
    expect(runs[1]).toEqual(["neon", "deploy", "--branch", "ci-12345-2", "--project-id", PROJECT_ID, "--no-env-pull", "--update-existing"]);
    expect(runs.at(-1)).toEqual(["bun", "--env-file=" + ENV_FILE, "scripts/verify-ci-branch.ts", "ci-12345-2"]);
    expect(runs.flat()).not.toContain("production");
    expect(runs.flat()).not.toContain(env.NEON_API_KEY);
    expect(io.calls).toContainEqual(["secure", ENV_FILE, 0o600]);
  });
  test("requires credentials before making any mutation", async () => {
    const io = fixture(); io.env = { ...env, NEON_API_KEY: "" };
    await expect(prepareNeon(io)).rejects.toThrow("NEON_API_KEY");
    await expect(cleanupNeon(io)).rejects.toThrow("NEON_API_KEY");
    expect(io.calls).toHaveLength(0);
  });
  test("cleanup only targets the run branch and erases the environment file", async () => {
    const io = fixture(); await cleanupNeon(io);
    expect(io.calls).toEqual([["run", ["neon", "branches", "delete", "ci-12345-2", "--project-id", PROJECT_ID]], ["remove", ENV_FILE, { force: true }]]);
  });
  test("failed deletion still erases credentials", async () => {
    const io = fixture(); io.run = async () => { throw new Error("delete failed"); };
    await expect(cleanupNeon(io)).rejects.toThrow("delete failed");
    expect(io.calls).toContainEqual(["remove", ENV_FILE, { force: true }]);
  });
});
describe("CI template isolation", () => {
  const target = { NEON_BRANCH: "ci-12345-2", NEON_BRANCH_ID: "br-unit-test", DATABASE_URL_UNPOOLED: "postgresql://owner:secret@ep-test.example.com/neondb" };
  test("refuses production names and mismatched branch metadata", () => {
    expect(validateCiTarget("ci-12345-2", target).ssl).toEqual({ rejectUnauthorized: true });
    for (const [name, value] of [["production", target], ["ci-12345-2", { ...target, NEON_BRANCH: "production" }], ["ci-12345-2", { ...target, NEON_BRANCH_ID: "" }]]) expect(() => validateCiTarget(name, value)).toThrow();
  });
  test("refuses a populated Auth template without changing it", async () => {
    const calls = [];
    const client = { query: async sql => { calls.push(sql); return { rows: [{ occupied: true }] }; } };
    await expect(verifyEmptyDatabase(client)).rejects.toThrow("Auth users");
    expect(calls).toHaveLength(1);
    expect(calls[0].startsWith("SELECT")).toBe(true);
  });
  test("refuses workspace data even when Auth is empty", async () => {
    const client = { query: async sql => ({ rows: [sql.includes("to_regclass") ? { relation: "workspaces" } : { occupied: !sql.includes('neon_auth') }] }) };
    await expect(verifyEmptyDatabase(client)).rejects.toThrow("workspace data");
  });
  test("accepts an empty template using only read queries", async () => {
    const calls = [];
    const client = { query: async sql => { calls.push(sql); return { rows: [sql.includes("to_regclass") ? { relation: null } : { occupied: false }] }; } };
    await verifyEmptyDatabase(client);
    expect(calls.every(sql => sql.startsWith("SELECT"))).toBe(true);
  });
});
