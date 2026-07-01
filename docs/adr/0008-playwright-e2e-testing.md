# ADR-0008: Playwright for end-to-end / rendered-layout testing

- Status: Accepted
- Date: 2026-07-01

## Context

The unit suite runs on Vitest in **jsdom**, which does not lay out or paint the page and has none
of the browser platform APIs. Two important classes of defect are therefore invisible to it:

- **Layout / responsive bugs** — horizontal overflow, wrapping, and grid sizing at phone widths.
  CLAUDE.md already calls these out ("Layout bugs are invisible to the unit suite … verify by eye").
- **Real interactions and platform capabilities** — clicking through the actual DOM/event path, and
  the Screen Wake Lock / Web Audio / sticky-timer behaviours from
  [ADR-0007](0007-live-session-browser-capabilities.md), which jsdom can only no-op.

Until now the only check for these was manual eyeballing in a browser, which is easy to skip and
impossible to regress-test.

## Decision

Add **Playwright** (`@playwright/test`) as a **dev dependency** for a thin end-to-end layer that
drives the real app in a headless Chromium. This does not touch the "no new *runtime* deps" rule
([ADR-0001](0001-vanilla-typescript-no-framework.md)) — Playwright ships nothing into `dist/`; it is
tooling, like Vite and Vitest.

- **Separate layer, separate directory.** E2E specs live in `e2e/*.spec.ts`. Vitest stays scoped to
  `src/**` / `test/**` `*.test.ts`, so the two runners never pick up each other's files.
- **Phone-first by default.** The Playwright project uses a small mobile viewport (Pixel 5 class) so
  overflow regressions surface, matching the responsive floor in CLAUDE.md (~320px must survive).
- **Auto-managed dev server.** `playwright.config.ts` starts `pnpm dev` for the run and reuses an
  already-running server locally, so `pnpm e2e` is one command.
- **Own npm task, not wired into `build`/CI (yet).** Run with `pnpm e2e` (or `pnpm e2e:headed`). It
  is intentionally kept out of `pnpm build` and the deploy path — it is heavier and needs a browser
  binary. Wiring it into CI is a later, deliberate step.
- **Artifacts are gitignored.** Reports, traces, and screenshots go to `.playwright/` (ignored).

Unit tests remain the primary, high-value target for pure logic (`domain/`, migrations, timing
helpers) — TDD there is unchanged. Playwright covers only what jsdom structurally cannot: rendered
layout and live browser behaviour. Keep e2e specs few and focused, not a parallel copy of the unit
suite.

## Consequences

- Layout and interaction regressions can now be caught automatically at a phone width, and an agent
  can *see* the rendered page (headless screenshot) instead of asserting it cannot.
- The platform capabilities in ADR-0007 (wake lock, audio-unlock-on-gesture, sticky offset) now have
  a place to be exercised in a real browser rather than only reasoned about.
- Contributors need the Playwright browser installed once (`pnpm exec playwright install chromium`);
  the binary lives in the user cache, outside the repo.
- Because e2e is not in `build`/CI, a green `pnpm build` does **not** imply e2e passed — run `pnpm e2e`
  when a change affects layout or live-session interaction.
- These conventions are summarised in `CLAUDE.md` (Tooling, Commands, and the Responsive & mobile
  note); keep the two in sync.
