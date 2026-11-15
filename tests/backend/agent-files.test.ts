import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectFiles, projectPath } from "../../src/server/agents/files";
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "project-tools-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
test("file tools and bash share persistent project files", async () => {
  const tools = projectFiles(root);
  await tools.write("hello.txt", "hello");
  expect((await tools.bash("cat hello.txt; echo world > next.txt")).stdout).toBe("hello");
  expect(await tools.read("next.txt")).toBe("world\n");
  expect(await readFile(join(root, "next.txt"), "utf8")).toBe("world\n");
});
test("direct tools reject traversal and host paths", async () => {
  const tools = projectFiles(root);
  expect(() => projectPath("../outside")).toThrow();
  expect(() => projectPath("/etc/passwd")).toThrow();
  await expect(tools.write("../outside", "bad")).rejects.toThrow();
});
test("symlink paths cannot be read or written by tools or bash", async () => {
  const outside = await mkdtemp(join(tmpdir(), "outside-tools-"));
  try {
    await writeFile(join(outside, "secret"), "private");
    await symlink(outside, join(root, "escape"));
    const tools = projectFiles(root);
    await expect(tools.read("escape/secret")).rejects.toThrow();
    await expect(tools.write("escape/secret", "bad")).rejects.toThrow();
    expect((await tools.bash("cat escape/secret")).exitCode).not.toBe(0);
    expect((await tools.bash("echo bad > escape/secret")).exitCode).not.toBe(0);
    expect(await readFile(join(outside, "secret"), "utf8")).toBe("private");
  } finally { await rm(outside, { recursive: true, force: true }); }
});
test("bash cannot run host binaries, access host files or network, or inherit secrets", async () => {
  const tools = projectFiles(root);
  for (const command of ["git status", "bun install", "curl https://example.com", "cat /etc/passwd", "cat ../../etc/passwd"]) {
    expect((await tools.bash(command)).exitCode).not.toBe(0);
  }
  process.env.TOOL_TEST_SECRET = "hidden";
  expect((await tools.bash("echo $TOOL_TEST_SECRET")).stdout).toBe("\n");
  delete process.env.TOOL_TEST_SECRET;
});
