# Neon migration

The application keeps SolidStart server rendering, Solid Router, Ark UI, Bun, and the established dashboard. Its data and identity now use Neon services rather than local filesystem authentication and browser-only sample edits.

## Project and service boundaries

The configured organization is `org-aged-glade-78373746`, project `patient-waterfall-66314702`, with production branch `production` in `aws-us-east-2`. [neon.ts](neon.ts) declares managed Auth, private `documents` Object Storage, Realtime origins, and the `summary` Function alongside the project's Postgres database. New non-default branches have a seven-day TTL; CI branches use an explicit 24-hour expiry and clone the protected, empty `ci-template` branch, never production.

| Concern | Implementation |
| --- | --- |
| Authentication | Managed Neon email/password accounts and GitHub OAuth; server-side cookie/session handling in [src/auth/server.ts](src/auth/server.ts) |
| Metadata | `workspaces`, `workspace_members`, and `workspace_items` in Postgres; JSON metadata preserves the dashboard item shape |
| Database connections | Long-lived Bun server using a bounded `pg` pool and certificate-verified TLS; direct connection reserved for migrations |
| Attachments | Private S3-compatible `documents` bucket; optional uploads up to 10 MiB, membership-authorized streamed attachment downloads |
| Live collections | Membership-scoped query sealed on the server, subscribed through the framework-neutral Neon SDK, renewed before expiry |
| Counts | JWT-protected Neon `summary` Function called server-to-server by the authenticated application API |

Each account receives one personal workspace with an owner membership and the baseline 12 projects, 36 issues, and 50 documents. Seeding happens once through the backend. Initial documents contain metadata only. New records and attachments survive reloads. Filters remain local browser state. There is no shared mutable collection singleton or production mock fallback.

All workspace reads, writes, attachment downloads, and live queries are membership-scoped. A sealed query includes the authenticated user and workspace parameters; its bearer capability stays in memory and is never stored in browser storage or URLs. The browser renews before expiry, recreates failed subscriptions with backoff, and closes its client, timers, and subscription on cleanup. Requests carry the identity captured when the page loaded; a changed or signed-out session returns the browser to `/dashboard` with a full page load to discard the previous user's state.

The summary API obtains a managed user token on the server and calls the Function. The Function verifies the token against Neon Auth JWKS and runs its own membership-scoped count query. The browser receives counts rather than the service token.

## Account migration

Registration is explicit: **Create a new account** creates a managed Neon account; submitting an unfamiliar email to Sign in does not create one. Password length is validated by the application and managed provider.

Previous `.data/` accounts, password records, and sessions are not automatically imported. Users must create a managed account or use the configured GitHub provider, and then receive their seeded personal workspace. Historical browser-only additions were not persisted and cannot be recovered by this migration. Keep any old ignored auth storage private; it is no longer the application's authentication backend.

GitHub replaces Discord. Configure the GitHub OAuth provider and its redirect values in Neon Console for the relevant branch and application origins. The GitHub button and redirect path are implemented, but a complete external OAuth round trip still requires manual verification. Old Discord credentials and `/api/oauth/discord` callback configuration are no longer used.

## Development setup

Use Bun for package installation, tooling, and serving. From the application directory, authenticate the Neon CLI and link the intended project if not already linked. Verify the project and branch before applying changes. Create a development branch:

```sh
bun install --frozen-lockfile
bunx --bun neon@9.4.0 checkout dev --create
bunx --bun neon@9.4.0 deploy --env .env.local
bun --bun run db:migrate
bun --bun run dev
```

`checkout` and `deploy` pull branch environment values into ignored `.env.local`. If `dev` already exists, use `checkout dev` without `--create`. Set `NEON_AUTH_COOKIE_SECRET` to a random value of at least 32 characters and `APP_ORIGIN=http://localhost:3000` in that local file before running the app. Use a different cookie secret per environment. Local browser integration uses `APP_ORIGIN=http://localhost:3010` and must use an isolated test branch, not production.

The original production credentials were pulled to ignored `.env.local` during setup. Creating/checking out a branch replaces those managed environment values with that branch's values. `.env.neon-test.local` was used for the isolated auth-migration verification profile; it is local and ignored. CI uses a separate disposable environment file and branch. Never copy production credentials into test configuration or logs.

## Runtime environment

These values belong on the server. Do not add public/Vite prefixes or expose secrets in the browser bundle.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled application Postgres connection |
| `DATABASE_URL_UNPOOLED` | Direct migration connection; migration runner rejects pooler hosts |
| `NEON_AUTH_BASE_URL` | Branch's managed Auth endpoint |
| `NEON_AUTH_JWKS_URL` | JWT verification keys for the summary Function |
| `NEON_AUTH_COOKIE_SECRET` | Application cookie/session protection; at least 32 characters |
| `APP_ORIGIN` | Public application origin, or localhost origin for development/tests |
| `AWS_ENDPOINT_URL_S3` | Branch's S3-compatible endpoint |
| `AWS_ACCESS_KEY_ID` | Object Storage credential |
| `AWS_SECRET_ACCESS_KEY` | Object Storage credential |
| `AWS_REGION` | Object Storage SDK region |
| `DOCUMENTS_BUCKET` | Optional bucket name override; defaults to `documents` |
| `NEON_REALTIME_URL` | Branch's Realtime endpoint; returned to authenticated browser clients |
| `NEON_REALTIME_SECRET` | Server-only live query sealing secret |
| `NEON_BRANCH_ID` | Branch identity used to address the summary Function |
| `NEON_FUNCTION_HOST_SUFFIX` | Function host suffix used with the branch identity |

The Neon CLI supplies service credentials; the application cookie secret and public origin are application settings. The deployed summary Function needs its database and Auth verification configuration as well. Keep local environment files, `.neon` linkage, credentials, and `.data/` ignored. The browser receives only public endpoint information, authorized metadata, and short-lived sealed capabilities.

## Schema migrations

Run migrations explicitly before starting a newly provisioned environment:

```sh
bun --bun run db:migrate
```

[scripts/migrate.ts](scripts/migrate.ts) uses `DATABASE_URL_UNPOOLED`, an advisory lock, transactions, and a checksum ledger. Never edit an applied migration; add a new numbered SQL file. The initial [001_workspace.sql](migrations/001_workspace.sql) uses `IF NOT EXISTS`. CI starts from the empty template and runs the migration sequence explicitly.

## Isolated CI and verification

The workflow uses a project-scoped Neon API key stored in the repository secret `NEON_API_KEY`, never an application browser credential. [scripts/ci-neon.mjs](scripts/ci-neon.mjs) derives `ci-<GitHub run ID>-<attempt>` itself, clones the protected `ci-template` branch, and gives the clone a 24-hour expiry. The template was sanitized once through managed Auth, separately from production. Before tests, it verifies that the clone has no Auth users, workspace rows, or document objects; a populated template fails closed. It does not drop or reset Auth schemas. It then applies services and the summary Function, pulls credentials to ignored `.env.neon-ci.local` with restrictive file permissions, and generates an environment-specific cookie secret. Migrations and the browser suite use that environment.

An `always()` cleanup step deletes only the derived CI branch and removes its local environment file. Expiry handles cancelled jobs that cannot complete cleanup. Raw CLI output is withheld by the helper so future diagnostics cannot print credentials. Public fork runs without the secret skip provisioning and run public-route browser checks; these do not replace the full managed-service integration suite.

The full browser coverage checks persistent creation/reload, uploaded/downloaded file bytes, cross-user access rejection, and cross-context updates through a token renewal interval exceeding 65 seconds, alongside navigation, dialogs, filtering, and mobile behavior. Backend and CI helper tests cover authorization/security boundaries and branch lifecycle behavior. External GitHub OAuth remains a manual check. Consult the latest test run for counts rather than treating a historical passing run as proof of a new deployment.

## Production rollout status

Neon service provisioning and repository changes do not deploy the application. Dokploy redeployment remains disabled by user instruction. Before any later authorized rollout, synchronize the production runtime environment with the production branch's service values, apply explicit migrations, verify GitHub provider configuration and public origins, and deploy the tested build. Serve the built application with Bun:

```sh
bun .output/server/index.mjs
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment workflow and activation controls. Do not enable production redeployment merely to validate a development or CI branch.
