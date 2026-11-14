# Local project agents

Projects and issues use Neon Postgres and the existing managed sign-in. Project creation opens a dedicated page and creates a local folder. Saving an issue sends it to the workspace's default pi agent; edit its dispatch prompt and primary `instructions.md` contents in Agents.

Add to ignored `.env.local`:

```dotenv
MINIMAX_API_KEY=your-direct-minimax-key
# Optional absolute path; defaults to .data/projects in this app's working directory.
PROJECTS_DIRECTORY=/absolute/path/to/projects
```

Restart the local server after changing environment variables. The direct MiniMax model is `MiniMax-M3.1-Flash` at `https://api.minimax.io/anthropic`. No OpenRouter or gateway is used. A missing/invalid key is reported in the run output; it never produces simulated agent output. Apply pending SQL using `bun run db:migrate` before starting updated code.

The project page shows linked issues and persisted tasks. Task creation and automatic task generation are deferred. Agents currently has one default agent per workspace. Its settings are captured when each run starts; editing them does not change already running work.

Only custom project read/write/edit tools and supported just-bash commands are enabled. Paths are scoped to the project's generated workspace/project folder; symlinks are rejected. Native commands such as git, bun, npm, Python and host shells, network commands, discovered extensions and host environment variables are unavailable to agent tools. The MiniMax request itself is made by the server outside those tools. This restriction is application-level; an OS/Wasmer sandbox is not implemented.

One run executes per project at a time, up to four projects on the local server. Further issues wait in Postgres. Output and tool results stream to the Ark drawer and persist for reopening. Closing the drawer does not stop work. Runs have a ten-minute limit and a one-MiB saved-output limit. Finished runs are ready for review; issues are not automatically resolved. File changes are written directly to the project folder, without git commits.

After a server restart, opening a workspace/project resumes pending dispatch. Runs left Running by a stopped server become Interrupted and are not rerun. File changes and previously accepted output remain. There are no automatic model retries. Reopen the project after fixing local server configuration if dispatch could not initialize.

Run only on the local machine for this phase. A hosted app has no access to folders on your laptop; moving execution to a server or adding Wasmer requires a later runtime change. Existing Dokploy releases remain disabled.

## Verification

`bun run check`, `bun run test:backend`, and `bun run build` validate types, folder boundaries, the real pi tool loop with controlled model responses, and bundling. Browser tests use a disposable Neon branch and explicitly remove the model credential from the test server to avoid paid model calls. They exercise project Save/Cancel, routing, linked issues, persisted settings, real failed dispatch/output replay, session handling and ownership checks.

For an explicitly disposable Neon branch (NEON_BRANCH starts `workflow-` or `ci-`), `bun --env-file=.env.workflow.local scripts/verify-agent-workflow.ts` exercises real Postgres dispatch and the real pi SDK using controlled MiniMax responses: capacity across five workspaces, duplicate issue submission, project file writes, ordered saved tool/text output, sequential project runs and interrupted recovery. It never calls the real model service.

The controlled tests do not prove account/model access. A separate real direct MiniMax run passed on 2026-11-14; details are below.

## Verified on 2026-11-14

- `bun --bun run check`: passed.
- `bun run test:ci`: 28 passed, 0 failed.
- `bun run test:backend`: 20 passed, 0 failed.
- `bun --env-file=.env.workflow.local --bun run test`: 18 passed (2.9 minutes), 0 failed, against a disposable Neon branch.
- `bun --env-file=.env.workflow.local scripts/verify-agent-workflow.ts`: all three Postgres + controlled pi dispatch scenarios passed, including accepted output on cancellation.
- `bun --bun run build`: passed. The built Bun server additionally passed sign-up → project/folder creation → project page → issue dispatch → SSE output, with no browser errors.
- `bun run db:migrate`: `Applied 002_agent_workflow.sql` on the app's configured Neon production branch. This applies schema only; no Dokploy deployment was triggered.
- Desktop project page and desktop/mobile drawers were visually inspected. Browser captures are under ignored `test-results/`.
- The first supplied MiniMax key returned HTTP 402, `insufficient balance (1008)`. The user replaced that key. A subsequent real run against direct `https://api.minimax.io/anthropic` using `MiniMax-M3.1-Flash` completed successfully in 21 seconds. The app retains safe, specific billing-error handling for future failures.
- After that error-handling change: backend tests 21 passed; targeted workflow browser tests 3 passed; typecheck and production build passed. The controlled tests above remain separate from real account access verification.

## Real MiniMax verification

With the corrected key, the built Bun app was run against a disposable Neon branch and temporary project directory. Browser-driven project creation and issue submission dispatched a real pi session to the direct MiniMax API. The agent used project_write to create hello.txt containing exactly `MINIMAX_LIVE_VERIFIED_20261114` plus one newline, then project_bash to read it back. The check compared the actual file bytes, observed output in the drawer while the run was Running, reloaded the project page, reopened the drawer and verified saved output replay. No browser errors occurred.

```json
{"model":"MiniMax-M3.1-Flash","endpoint":"https://api.minimax.io/anthropic","status":"Completed","storedEvents":14,"exactFileBytes":true,"streamedWhileRunning":true,"persistedOutputReopened":true,"browserErrors":0,"elapsedSeconds":21}
```

Captures: `test-results/minimax-live-drawer-desktop.png`, `test-results/minimax-live-drawer-mobile.png`; exact copied file: `test-results/minimax-live-hello.txt`. These artifacts are ignored. Temporary verification infrastructure and credentials were removed afterward; the user's `.env.local` was preserved. No production deployment was triggered.
