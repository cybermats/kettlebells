# ADR-0002: Vite build, static hosting

- Status: Accepted
- Date: 2026-06-29

## Context

There is no backend and no dynamic content rendered on a server. We still want a good dev
experience (fast reload, native TS, ES modules) and an optimized production bundle.

## Decision

Use **Vite** as the build tool. `vite build` emits plain static HTML/CSS/JS to `dist/`. Hosting
is any static file server (e.g. GitHub Pages, Netlify, S3) — no SSR and no server runtime.

## Consequences

- Fast dev server and zero-config TypeScript during development.
- Deployment is "upload the `dist/` folder." No server to operate or secure.
- PWA assets (service worker, manifest) are produced as static files (see ADR-0004).
- The build step is allowed to be relatively sophisticated even though the runtime is plain
  static files.
