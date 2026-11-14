import { appendFile, chmod, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export const PROJECT_ID = "patient-waterfall-66314702";
export const TEMPLATE_BRANCH = "ci-template";
export const ENV_FILE = ".env.neon-ci.local";

export function ciBranchName(env = process.env) {
  if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? "") || !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? "")) {
    throw new Error("Expected numeric GitHub run ID and attempt");
  }
  return ["ci", env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT].join("-");
}

async function execute(args) {
  const binary = Bun.which(args[0]);
  if (!binary) throw new Error("Pinned Neon CLI is not installed");
  const command = args[0] === "bun" ? [binary, ...args.slice(1)] : ["bun", binary, ...args.slice(1)];
  const env = { ...process.env };
  if (args[0] === "bun") {
    for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "NEON_BRANCH", "NEON_BRANCH_ID",
      "NEON_AUTH_BASE_URL", "NEON_AUTH_JWKS_URL", "NEON_AUTH_COOKIE_SECRET", "NEON_REALTIME_URL",
      "NEON_REALTIME_SECRET", "NEON_FUNCTION_HOST_SUFFIX", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
      "AWS_ENDPOINT_URL_S3", "AWS_REGION"]) delete env[key];
  }
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" });
  const [status] = await Promise.all([child.exited, new Response(child.stdout).arrayBuffer(), new Response(child.stderr).arrayBuffer()]);
  const stage = args[0] === "neon" ? args.slice(0, args[1] === "branches" || args[1] === "env" ? 3 : 2).join(" ") : "verify-ci-branch";
  if (status !== 0) throw new Error("Neon CI " + stage + " failed (exit " + status + "); branch expires automatically within 24 hours");
}

export async function prepareNeon({ env = process.env, run = execute, append = appendFile,
  remove = rm, secure = chmod, now = () => new Date(), cookieSecret = () => randomBytes(48).toString("hex") } = {}) {
  const branch = ciBranchName(env);
  if (!env.NEON_API_KEY) throw new Error("NEON_API_KEY is required for isolated Neon CI");
  const project = ["--project-id", PROJECT_ID];
  const expires = new Date(now().getTime() + 24 * 60 * 60 * 1000).toISOString();
  console.log("Creating isolated Neon branch " + branch + " from the empty CI template");
  await run(["neon", "branches", "create", "--name", branch, "--parent", TEMPLATE_BRANCH, "--expires-at", expires, "--no-secrets", ...project]);
  await run(["neon", "deploy", "--branch", branch, ...project, "--no-env-pull", "--update-existing"]);
  await remove(ENV_FILE, { force: true });
  await run(["neon", "env", "pull", "--branch", branch, ...project, "--file", ENV_FILE,
    "--service", "postgres", "--service", "auth", "--service", "object-storage", "--service", "functions", "--service", "realtime"]);
  await secure(ENV_FILE, 0o600);
  await append(ENV_FILE, "\nNEON_AUTH_COOKIE_SECRET=" + cookieSecret() + "\nAPP_ORIGIN=http://localhost:3010\n");
  // Fail before browser tests if anyone accidentally populated the template.
  await run(["bun", "--env-file=" + ENV_FILE, "scripts/verify-ci-branch.ts", branch]);
  console.log("Empty isolated Neon environment verified; no production data is used");
}

export async function cleanupNeon({ env = process.env, run = execute, remove = rm } = {}) {
  const branch = ciBranchName(env);
  if (!env.NEON_API_KEY) throw new Error("NEON_API_KEY is required for Neon CI cleanup");
  try {
    console.log("Deleting isolated Neon CI branch " + branch);
    await run(["neon", "branches", "delete", branch, "--project-id", PROJECT_ID]);
  } finally { await remove(ENV_FILE, { force: true }); }
}

if (import.meta.main) {
  try {
    if (Bun.argv[2] === "prepare") await prepareNeon();
    else if (Bun.argv[2] === "cleanup") await cleanupNeon();
    else throw new Error("Usage: bun scripts/ci-neon.mjs prepare|cleanup");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Isolated Neon CI failed");
    process.exitCode = 1;
  }
}
