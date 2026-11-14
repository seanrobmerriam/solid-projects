# SolidProjects documentation

Astro documentation site using [`@prosefly/astro-theme-lotus`](https://github.com/prosefly/astro-theme-lotus), managed as the `documentation` Bun workspace.

Install dependencies from the repository root:

```sh
bun install --frozen-lockfile
bun --bun run docs:dev
```

Use `bun --bun run dev:all` at the root to start both the app and docs. Astro uses port 4321 by default. When starting the docs server through automation, follow [AGENTS.md](AGENTS.md) and use `bun --bun run docs:dev --background`; manage it from this directory with `bun --bun run dev stop`, `bun --bun run dev status`, and `bun --bun run dev logs`.

| Root command | Description |
| --- | --- |
| `bun --bun run docs:dev` | Start the documentation dev server. |
| `bun --bun run docs:build` | Build into `documentation/dist/`. |
| `bun --bun run docs:preview` | Preview the production docs build. |
| `bun --bun run docs:check` | Run Astro type and content checks. |

Commands inside this directory (`bun --bun run dev`, `build`, `preview`, or `check`) still work. The root `bun.lock` controls installs for both projects; do not create a local lockfile or use npm. Existing docs dependency versions are pinned during the workspace migration.

## Content structure

```text
src/
  content.config.ts      Registers the Lotus docs collection
  content/docs/          MDX documentation pages
theme.config.json        Navigation, appearance, search and footer
```

The theme reads MDX files from `src/content/docs`. The current `docsBase: '/'` serves `index.mdx` at `/` and the docs entry page at `/overview/`. Edit `theme.config.json` to customize the site.

The parent repository's CI checks and builds this workspace. The nested template workflow under `.github/` is not active in the monorepo; no docs publishing target is configured by this change.
