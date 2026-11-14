# Solid + Ark UI workspace

An authenticated project workspace built with SolidStart 2, SolidJS, Ark UI, and Bun. Overview, Projects, Issues, and Documents share a persistent sidebar and toolbar, searchable listboxes, creation dialogs, and document attachments. Neon supplies managed authentication, persistent Postgres metadata, private Object Storage, Realtime updates, and a summary Function.

## Run locally

Requires Bun 1.4.3, pinned in `.bun-version`, and access to the configured Neon project. Run commands from this application directory.

```sh
bun install --frozen-lockfile
bunx --bun neon@9.4.0 checkout dev --create
bunx --bun neon@9.4.0 deploy --env .env.local
bun --bun run db:migrate
bun --bun run dev
```

Use an isolated development branch rather than the production database. The Neon CLI must already be authenticated and linked to the intended project; see [NEON_MIGRATION.md](NEON_MIGRATION.md) for project identity, environment requirements, and migration details. Neon pulls branch credentials into ignored `.env.local`. Add `NEON_AUTH_COOKIE_SECRET` with at least 32 characters and `APP_ORIGIN=http://localhost:3000` to that local file. Never commit credentials.

Open `/dashboard`. Use **Create a new account** for explicit email/password registration, then sign in. Existing local filesystem accounts and sessions are not imported automatically. GitHub replaces the previous Discord provider; GitHub sign-in also requires provider configuration in Neon Console. The external OAuth flow still needs a manual end-to-end check. Successful authentication opens `/dashboard/views/overview`; `/login` remains supported.

## Dashboard

| Route | Content |
| --- | --- |
| `/dashboard` | Sign-in page; authenticated users go to Overview |
| `/dashboard/views/overview` | Current issues above all projects |
| `/dashboard/views/projects` | Project summary and All Projects list |
| `/dashboard/views/issues` | Issue summary and All Issues list |
| `/dashboard/views/documents` | Document summary and All Documents list |

Every dashboard view and workspace API verifies the managed server session, including direct requests and reloads. Sidebar links, the Views menu, and the view combobox navigate through Solid Router while keeping the workspace shell mounted. Projects, Issues, and Documents expand in the sidebar.

Collections use Ark UI Listbox with `useListCollection` filtering. Search matches titles, descriptions, references, statuses, owners, project names, and metadata. Searches ignore letter case and surrounding whitespace. Clear searches from the field or Edit → Clear filters. Arrow keys navigate focused lists; Enter opens details and Escape closes dialogs.

The `+ Project`, `+ Issue`, and `+ Document` buttons save records to the authenticated user's workspace. Records persist after reload, and Realtime delivers committed updates to other open sessions for that workspace. Filters stay local to the mounted layout and reset on reload. Document creation accepts an optional attachment up to 10 MiB; uploaded files can be downloaded from document details through an authorized attachment endpoint.

## Seed data and persistence

Each new account receives a personal workspace seeded from [projects.json](src/data/projects.json) (12 projects), [issues.json](src/data/issues.json) (36 issues), and [documents.json](src/data/documents.json) (50 document metadata records). Seeded documents do not include uploaded file bytes. These files establish the initial dataset; live collections are loaded from Postgres, with no mock fallback when the backend fails.

Membership checks scope database queries, file access, sealed live queries, and the summary Function to the current user. The layout-scoped [workspace context](src/components/dashboard/WorkspaceContext.tsx) owns browser state and disposes subscriptions and timers when unmounted. See [NEON_MIGRATION.md](NEON_MIGRATION.md) for the service boundaries and migration procedure.

## Verify

```sh
bun --bun run check
bun --bun run test:ci
bun --bun run test:backend
bun --bun run build
bun --bun run test:smoke
bunx --bun playwright install chromium
bun --bun run test
```

The full [Playwright suite](tests/dashboard.spec.ts) requires an isolated Neon environment with all services enabled and the application schema migrated. Its server uses port 3010. Coverage includes authentication, route protection, shell/navigation behavior, filtering, dialogs, keyboard and mobile interactions, persistent records, private attachment bytes, cross-user isolation, and live updates across token renewal. Allow more than 65 seconds for the renewal integration case. GitHub's external OAuth flow is not automated.

To serve a production build with Bun:

```sh
bun .output/server/index.mjs
```

## CI/CD

[GitHub Actions](.github/workflows/ci.yml) runs type checking, CI/backend tests, build and smoke checks. With the repository's scoped `NEON_API_KEY` secret, it creates a disposable `ci-<run>-<attempt>` Neon branch from the protected empty `ci-template`, provisions services, migrates the schema, and runs the full browser suite. Cleanup deletes the branch; a 24-hour expiry covers interrupted runs. Public fork runs without that secret execute public-route browser checks instead.

Production Dokploy redeployment remains disabled until explicitly enabled with `DEPLOY_ENABLED=true`. Provisioning Neon does not synchronize the application's production runtime environment or redeploy the app. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment controls and [NEON_MIGRATION.md](NEON_MIGRATION.md) for the required runtime configuration.
