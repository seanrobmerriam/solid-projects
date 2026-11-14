# Neon migration verification

The services are declared in `neon.ts` for project `patient-waterfall-66314702`, production branch `production`, region `aws-us-east-2`. Production application deployment remains disabled.

## Provisioning

`bun install -g neon@latest` installed Neon CLI 9.4.0. The requested `neon init` linked the existing organization/project and wrote the service configuration. This machine also has an older CLI earlier on PATH; subsequent provisioning used the Bun-installed CLI explicitly.

Production `neon deploy` output:

```text
Applied changes
  + function summary
Utilized services: Postgres, Neon Auth, Object Storage, Functions, Realtime
```

The explicit production database migration reported:

```text
Applied 001_workspace.sql
```

Service values were pulled to ignored local environment files. No credential values are included in this report or tracked source.

## Build and app execution

The application was built with Bun, then Playwright started `bun .output/server/index.mjs` on localhost:3010 using an isolated Neon environment:

```sh
bun --env-file=.env.neon-ci.local scripts/migrate.ts
bun --bun run check
bun --env-file=.env.neon-ci.local --bun run build
CI=true bun --env-file=.env.neon-ci.local --bun run test
```

Build output:

```text
✓ built
ℹ Generated .output/nitro.json
```

Live browser-suite output:

```text
Running 12 tests using 1 worker
12 passed (1.7m)
```

The tests exercise managed account creation, password sign-in and errors, session restoration, sign-out, protected routes, Postgres persistence after reload, another browser context receiving a committed write without reloading, renewal beyond the original 60-second capability lifetime, real object upload/download with exact byte comparison, a different user being denied the file, and authenticated Function counts. Missing bearer credentials are rejected by the deployed Function. Desktop and mobile upload/detail screenshots were inspected; no horizontal overflow was found.

Backend and CI lifecycle test results:

```text
9 pass, 0 fail — backend authorization/input/upload boundaries
28 pass, 0 fail — deployment and CI lifecycle
```

## Failures found and resolved

- A bundled realtime client/server dependency produced a CommonJS-helper import cycle. Explicit SSR dependency externalization corrected built-server startup.
- SolidStart's catch-all API route did not cover the empty `/api/workspace` path. An index handler now covers that path.
- The summary Function initially compared the token issuer with the full Auth endpoint. It now checks the endpoint's origin, as required by Neon.
- Neon rejected managed Auth provisioning on schema-only branches, including after an empty-schema reset. CI instead clones a protected, sanitized `ci-template` branch and verifies that Auth users, workspace rows and stored objects are empty before testing. Schema-reset code was removed. Each test clone expires after 24 hours and is explicitly deleted after the run.

## Remaining external verification

The user is configuring the GitHub OAuth provider in Neon. Email/password Auth is verified; a complete GitHub consent/callback round trip has not been verified. Existing local accounts/password records and sessions are not imported automatically. Production Dokploy runtime variables must be synchronized before any later app rollout. Releases remain disabled while these final rollout tasks are pending.
