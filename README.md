# Solid + Ark UI workspace

An authenticated project workspace built with SolidStart and Ark UI. The dashboard includes Overview, Projects, Issues, and Documents, a persistent sidebar and toolbar, searchable listboxes, and dialogs for viewing and creating sample records.

## Run locally

Requires Node.js 24 or newer and Bun (or pnpm).

```sh
bun install
bun run dev
```

Open `/dashboard`. The existing email/password authentication creates an account the first time an email is used, and checks the password for returning users. Successful sign-in opens `/dashboard/views/overview`. The legacy `/login` entry still works.

Set `SESSION_SECRET` to a long random value in `.env.local`. For the existing Discord OAuth sign-in, also configure `DISCORD_ID` and `DISCORD_SECRET`, with a Discord callback URL of `http://localhost:3000/api/oauth/discord`. These credentials remain on the server.

For production behind a TLS-terminating reverse proxy, set the server environment variable `OAUTH_ORIGIN=https://solid.typesayfe.com`. Register `https://solid.typesayfe.com/api/oauth/discord` in the same Discord application's OAuth2 redirects. The explicit origin keeps both authorization and token exchange on the public HTTPS callback even when the internal request uses HTTP. Leave `OAUTH_ORIGIN` unset locally to use the incoming development URL.

## Dashboard

| Route | Content |
| --- | --- |
| `/dashboard` | Sign-in page; signed-in users go to Overview |
| `/dashboard/views/overview` | Current issues above all projects |
| `/dashboard/views/projects` | Project summary and All Projects list |
| `/dashboard/views/issues` | Issue summary and All Issues list |
| `/dashboard/views/documents` | Document summary and All Documents list |

Every dashboard view requires the existing server session, including direct navigation and reloads. Sidebar links, the Views menu, and the view combobox update nested routes while keeping the shell mounted. Projects, Issues, and Documents expand in the sidebar to reveal their records.

Every collection uses Ark UI Listbox with `useListCollection` and its `filter` function. Search matches titles, descriptions, references, statuses, owners, project names, and metadata. Clear searches from the search field or Edit → Clear filters. Use the arrow keys to navigate a focused list and Enter to open details.

The `+ Project`, `+ Issue`, and `+ Document` buttons (also available in Actions) add records to the current workspace. **Mock additions and filters survive view navigation but reset on reload.** The application uses Ark UI for interactive primitives and its element factory for ordinary buttons, headings, and layout elements.

## Mock collections

- [projects.json](src/data/projects.json): 12 projects with owners, progress, status, due dates, and references.
- [issues.json](src/data/issues.json): 36 issues with priorities, statuses, owners, and project relationships.
- [documents.json](src/data/documents.json): 50 documents with authors, project relationships, file types, sizes, versions, dates, statuses, and tags.

The layout-scoped [workspace context](src/components/dashboard/WorkspaceContext.tsx) owns local changes. There is no new database or external service dependency. The original auth storage remains in the ignored `.data/` directory.

## Verify

```sh
bun run check
bun run build
bunx playwright install chromium
bun run test
```

[Playwright tests](tests/dashboard.spec.ts) cover route protection, login/logout, all navigation controls, persistence of the shell, filtering and empty states, record creation, keyboard interaction, view titles, browser history, and mobile navigation. The test server uses port 3010 and a local `example.test` account in the existing auth storage. Discord's external provider flow requires real credentials and is not automated.

Type checking keeps strict application checks enabled. A [public API declaration](src/types/start-oauth.d.ts) provides types for the existing source-distributed OAuth package, whose unrelated GitHub provider contains implicit-any errors. Library declaration checking is skipped because some dependencies ship invalid declarations and optional adapter types.
