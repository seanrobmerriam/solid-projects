# Repository instructions

These instructions apply to this workspace and all descendants. The application lives in [solid-arkui-projects/](./solid-arkui-projects/). Run application commands from that directory.

## Established stack

- **Bun is the runtime and package manager.** Use Bun to install dependencies, execute scripts, run tooling, and start the application. Do not substitute Node.js, npm, npx, pnpm, or Yarn unless the user explicitly requests a change.
- **SolidStart is the application framework.** Preserve SolidStart 2, SolidJS, Solid Router, file-based routing, server rendering, and the existing Vite/Nitro integration. Do not migrate to React, Next.js, another framework, or a client-only SPA.
- **Ark UI for Solid is the component system.** Use `@ark-ui/solid` primitives for interactive controls and its `ark` factory for ordinary elements such as buttons, headings, and layout containers. Do not add another component library or replace Ark controls with custom widgets.
- Keep TypeScript strict, use Solid signals/stores and control-flow components, and preserve reactive props. Do not introduce React hooks or React-specific patterns.
- Keep the existing CSS/Tailwind 4 styling approach and `lucide-solid` icons.

## Bun commands and dependencies

Run these inside the application directory:

```sh
bun install --frozen-lockfile
bun --bun run dev
bun --bun run check
bun --bun run test
bun --bun run build
bunx --bun playwright install chromium
bun .output/server/index.mjs
```

- Use `bun add <package>`, `bun add --dev <package>`, and `bun remove <package>` for dependency changes. Keep dependencies limited to what the task requires.
- [bun.lock](./solid-arkui-projects/bun.lock) is the authoritative lockfile. Update it through Bun when dependencies change. Do not generate or update npm, pnpm, or Yarn lockfiles; the existing pnpm lockfile is a legacy artifact.
- Use `bun --bun run <script>` and `bunx --bun <tool>` to select Bun as the JavaScript runtime for tooling that would otherwise use a Node shebang.
- The current `start` script explicitly invokes Node. Launch the built server with `bun .output/server/index.mjs`; future changes to runtime scripts must use Bun.
- Do not perform unsolicited dependency upgrades or change framework/component-library major versions.

## Preserve the approved UI

The current dashboard is the approved visual and interaction baseline. Extend its existing components and styles instead of redesigning it. Change this baseline only when the user explicitly requests a design change.

### Visual reference

- Use [app.css](./solid-arkui-projects/src/app.css) and [dashboard.css](./solid-arkui-projects/src/components/dashboard/dashboard.css) as the source of truth for colors, typography, spacing, sizing, and responsive behavior.
- Preserve the light workspace: white main canvas, pale slate sidebar, indigo accent and selection states, muted metadata, thin borders, restrained corner radii, and compact list rows.
- Preserve the existing system sans-serif typography and hierarchy. Reuse the established tokens, including accent `#5355d1`, text `#252938`, muted text `#70788a`, and borders `#e5e8ef`.
- Match existing buttons, badges, fields, dialogs, icons, hover states, and focus states. Avoid new themes, fonts, decorative gradients, or different visual treatments unless requested.
- Preserve mobile sidebar behavior, responsive columns, independent list scrolling, visible keyboard focus, accessible labels, and reduced-motion support. Prevent horizontal overflow.

### Layout and navigation

- Keep the full-height sidebar beside the main workspace. The toolbar sits above the content with the current view heading on the left, Actions/Edit/Views menus, and the view combobox on the right.
- Keep Overview, Projects, Issues, and Documents as the initial sidebar entries. Projects, Issues, and Documents expand to reveal child records. Preserve the sidebar's vertical Ark Menu navigation.
- Keep [DashboardLayout](./solid-arkui-projects/src/components/dashboard/DashboardLayout.tsx) and its workspace provider mounted across view changes. Sidebar links, the Views menu, and the combobox navigate through Solid Router; only the routed content is replaced. Keep the heading, active link, combobox, URL, and browser history synchronized.
- Overview shows current issues above all projects. Dedicated collection pages retain their summary area, their `All Projects` / `All Issues` / `All Documents` heading and matching `+` button, and their listbox in the lower half.
- Reuse [CollectionPanel](./solid-arkui-projects/src/components/dashboard/CollectionPanel.tsx). Collection filtering must use Ark UI `useListCollection` with its `filter` function, including case-insensitive and trimmed searches, metadata matching, result counts, and empty states.
- Preserve Ark creation/detail dialogs and keyboard interaction, including arrow-key list navigation, Enter to open details, and Escape to close dialogs.

## Routing, authentication, and state

- `/dashboard` and `/dashboard/` are the sign-in entry. `/login` remains a supported legacy entry. Successful authentication opens `/dashboard/views/overview`.
- Protect every dashboard view with the existing server session, including direct requests and reloads. Preserve password and Discord authentication, sign-out, and error handling. Never replace authentication with a client-only guard or demo bypass.
- Keep the existing nested views at `/dashboard/views/overview`, `/dashboard/views/projects`, `/dashboard/views/issues`, and `/dashboard/views/documents`.
- Keep dashboard page titles centralized in [app.tsx](./solid-arkui-projects/src/app.tsx) so they follow route changes without stale or duplicate title elements.
- Keep mock collections in [src/data/](./solid-arkui-projects/src/data/) and local edits in [WorkspaceContext.tsx](./solid-arkui-projects/src/components/dashboard/WorkspaceContext.tsx). State belongs to the layout/request, not a mutable module-level singleton.
- Mock additions and filters survive view changes and reset on reload. Preserve that behavior and its UI notice unless persistence is explicitly requested. Do not add a backend or external service for a UI-only task.
- Keep secrets server-side and local auth storage ignored. Do not expose or commit environment files, credentials, or `.data/` contents.

## Verification

- For code changes, run the relevant checks through Bun. Before reporting a functional change complete, run `bun --bun run check`, `bun --bun run test`, and `bun --bun run build`; report actual results and any limits.
- Use the existing [Playwright suite](./solid-arkui-projects/tests/dashboard.spec.ts) for auth, navigation, filtering, dialogs, keyboard interaction, and mobile behavior. Its development server uses port 3010.
- For visual changes, inspect the rendered result at desktop and mobile widths and compare it with the approved UI. Check for clipping, overflow, focus regressions, framework overlays, and browser errors.
- Preserve the development dependency prebundling and ignored auth-storage/test-output paths in [vite.config.ts](./solid-arkui-projects/vite.config.ts). Preserve the existing OAuth type declaration unless replacing it with a verified upstream fix; do not weaken application typing to hide dependency errors.
- Documentation-only changes require checking accuracy and links, not rerunning the application test suite.
