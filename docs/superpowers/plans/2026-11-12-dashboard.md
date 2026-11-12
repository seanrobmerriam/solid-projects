# Dashboard Implementation Plan

**Goal:** Build the requested authenticated SolidStart dashboard with Ark UI controls and realistic local mock data.

**Architecture:** Keep the existing session/password/Discord authentication. `/dashboard/index.tsx` hosts the existing sign-in experience; a shared `/dashboard` parent guards and wraps `/dashboard/views/*`. Nested routes update only the content pane. A layout-scoped context holds mock collections so navigation preserves additions and selection.

**Tech stack:** SolidStart 2, Solid Router, Ark UI for Solid, TypeScript, CSS, Playwright.

**Spec:** The user's dashboard requirements in this session.

## Constraints and decisions

- Dashboard entry and legacy `/login` remain publicly accessible sign-in pages; authenticated users go to `/dashboard/views/overview`.
- Server session checks guard every dashboard child route, including direct visits and reloads. Existing root protection remains.
- Use Ark Menu with `orientation="vertical"` for sidebar navigation and nested child menus, Ark Menu for Actions/Edit/Views, Ark Combobox for view switching, and Ark Listbox plus `useListCollection({ filter })` for collections.
- Use Ark Field, Dialog, Avatar, and the Ark element factory for other controls.
- Overview uses vertically stacked issue and project lists; dedicated collection pages reserve the lower half for their list.
- Light slate workspace, indigo selection/focus accents, full-height pale sidebar, compact toolbar, system sans typography, and responsive scrolling.
- Include approximately 50 documents with authors, dates, file types, sizes, project relationships, and statuses, plus realistic projects and issues.
- Creation buttons add records to the in-memory mock collection; selection opens a metadata dialog. No database changes.

## Tasks

- [x] Add Ark UI and verification tooling. Write end-to-end tests covering unauthenticated routes, password login, view navigation, filtering, and creation; confirm the missing dashboard fails them.
- [x] Adapt existing auth redirects and reuse sign-in UI at dashboard entry with Ark fields and controls.
- [x] Create typed mock JSON collections and a dashboard context for local additions, selection, filtering, and edit actions.
- [x] Build persistent sidebar/toolbar layout, nested routes, list panels, and dialogs with Ark UI.
- [x] Style and verify desktop/mobile layouts, keyboard controls, direct-route protection, sign-out, filter empty states, and correct data counts.
- [x] Run TypeScript, production build, and complete Playwright suite. Record any external verification limits.

## Review focus

- An expired/absent session must never render protected collection data.
- `/dashboard/`, `/login`, OAuth completion, and password completion must converge on Overview without redirect loops.
- Sidebar, Views menu, and combobox must agree with the URL, including back/forward and direct URLs.
- Searches must handle mixed case, whitespace, metadata, no results, and resetting a filter.
- Sidebar/toolbar must remain mounted across view changes and remain usable at narrow viewport widths.

## Verification

- `bun run check`: passed with strict application typing.
- `bun run build`: passed for client, SSR, and Nitro output.
- `bun run test`: all six Chromium end-to-end tests passed.
- Visual checks at 1440×1000 and 390×844: no horizontal overflow; all required controls remain available.
- Runtime check: no browser page errors or console warnings during login and view navigation.
- Preserved Discord integration; its external provider flow was not exercised.
