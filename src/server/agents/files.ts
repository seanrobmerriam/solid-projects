import { mkdir, lstat, realpath, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Bash, ReadWriteFs } from "just-bash";

export function projectPath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").includes("..")) {
    throw new Error("Use a relative path inside the project folder");
  }
  return `/${path}`;
}
export async function ensureProjectDirectory(workspaceId: string, projectId: string) {
  if (![workspaceId, projectId].every(id => /^[a-zA-Z0-9-]{1,100}$/.test(id))) throw new Error("Invalid project identity");
  const root = resolve(process.env.PROJECTS_DIRECTORY || ".data/projects");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(root);
  const workspace = join(canonicalRoot, workspaceId);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await lstat(workspace)).isSymbolicLink() || await realpath(workspace) !== workspace) throw new Error("Project directory cannot be a symlink");
  const directory = join(workspace, projectId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error("Project directory cannot be a symlink");
  return directory;
}
// Only used to compensate a failed insertion of a newly allocated project ID.
export async function removeNewProjectDirectory(directory: string) { await rm(directory, { recursive: true, force: true }); }
export function projectFiles(root: string) {
  const fs = new ReadWriteFs({ root, allowSymlinks: false, maxFileReadSize: 1024 * 1024, maxCopySize: 1024 * 1024 });
  const shell = new Bash({ fs, cwd: "/", env: {}, python: false, javascript: false,
    executionLimits: { maxExecutionTimeMs: 10_000, maxOutputSize: 64 * 1024, maxCommandCount: 1000, maxLoopIterations: 1000 } });
  return {
    read: async (path: string) => fs.readFile(projectPath(path)),
    write: async (path: string, content: string) => {
      if (Buffer.byteLength(content) > 1024 * 1024) throw new Error("File content exceeds 1 MiB");
      const target = projectPath(path);
      await fs.mkdir(target.slice(0, target.lastIndexOf("/")) || "/", { recursive: true });
      await fs.writeFile(target, content);
    },
    bash: (command: string, signal?: AbortSignal) => {
      if (command.length > 16_000) throw new Error("Command is too long");
      return shell.exec(command, { signal }).catch(() => ({ stdout: "", stderr: "Project filesystem access denied", exitCode: 1, env: {} }));
    },
  };
}
