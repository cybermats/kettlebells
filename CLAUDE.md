# CLAUDE.md

Guidance for agents working in this repo. Read this first; it is the source of truth for how we build here.

## What this is

A web app to track progress through the **Simple & Sinister 2.0** kettlebell program.
It tracks *progress only* — not form, coaching, or technique. The defining feature is
**per-set weight control**: the user chooses the weight for each individual set so they can
step-load a heavier bell in gradually.

Everything runs in the browser. There is **no backend** and **no account system**. All data
lives locally on the device. See the README for the product pitch.

## Architecture decisions (do not relitigate without an ADR)

These are settled. If a task seems to require changing one, stop and raise it with the user
rather than working around it. Each has a record in `docs/adr/`.

- **Vanilla TypeScript, no UI framework.** No React/Vue/Svelte/etc. Build UI with plain DOM
  APIs organized into small modules. ([ADR-0001](docs/adr/0001-vanilla-typescript-no-framework.md))
- **Vite, static output.** `vite build` produces plain static HTML/CSS/JS. Hosting just serves
  files. No SSR, no server runtime. ([ADR-0002](docs/adr/0002-vite-static-hosting.md))
- **Client-only persistence: `localStorage` + JSON export/import.** No network calls for data.
  A manual backup/restore (export to / import from a JSON file) protects against the browser
  clearing storage. ([ADR-0003](docs/adr/0003-localstorage-persistence.md))
- **Offline-first installable PWA.** Service worker caches the app shell; usable on a phone at
  the gym with no signal. ([ADR-0004](docs/adr/0004-offline-first-pwa.md))
- **Open Props for styling.** Plain hand-written CSS using Open Props design tokens
  (`var(--size-3)`, `var(--radius-2)`, …). No Tailwind, no CSS-in-JS.
  ([ADR-0005](docs/adr/0005-open-props-styling.md))
- **Opinionated progression coach.** The app prescribes the next session (per-set weights + rest)
  via a pure step-loading engine: manual weight advance, rest auto-computed from the standard, one
  stressor at a time. ([ADR-0006](docs/adr/0006-progression-coach.md))
- **Live-session browser capabilities, gracefully degraded.** The active-session screen uses
  platform APIs beyond the DOM — Screen Wake Lock, Web Audio (the set-due chime), and a sticky
  timer — each feature-detected and reduced to a safe no-op when unsupported.
  ([ADR-0007](docs/adr/0007-live-session-browser-capabilities.md))
- **Playwright for e2e / rendered-layout testing.** A thin end-to-end layer drives the real app in a
  headless browser at a phone viewport, covering what jsdom cannot — layout/overflow and live
  interactions. It is a dev dependency in its own `pnpm e2e` task, kept out of `build`/CI.
  ([ADR-0008](docs/adr/0008-playwright-e2e-testing.md))

**TypeScript is strict** (`strict: true`). Lean on the types — they are the main guardrail.

## Project layout

```
index.html              # entry; loads src/main.ts
public/                 # static assets copied as-is (icons, manifest.webmanifest)
src/
  main.ts               # bootstraps the app, wires state -> render -> events
  domain/               # PURE program logic: types, the coach/progression engine, standards. No DOM/storage.
  storage/              # localStorage read/write, schema version + migrations, export/import
  state/                # app state container + tiny pub/sub
  ui/                   # render functions / views, plain DOM. One module per view.
  styles/               # CSS (imports Open Props), tokens, layout
  pwa/                  # service worker + registration
test/                   # or colocate *.test.ts next to source
docs/adr/               # architecture decision records
```

Keep `domain/` free of DOM and storage so the program rules stay pure and unit-testable.
Dependencies flow one way: `ui` → `state` → `domain`, and `storage` ↔ `state`. `domain` depends
on nothing in the app.

## UI pattern (no framework)

Keep it simple and explicit:

1. A single app **state** object is the source of truth (in `state/`).
2. **Render functions** take state and produce/update DOM (in `ui/`). No hidden state in the DOM.
3. **Event handlers** mutate state through the state container, which notifies subscribers to
   re-render.
4. State is persisted to `localStorage` on change (via `storage/`).

Do not reach for a virtual DOM, signals library, or web-component framework. If a view gets
complex, split it into more render functions, not more dependencies.

## Responsive & mobile

This is a phone-first PWA used at the gym ([ADR-0004](docs/adr/0004-offline-first-pwa.md)). Design
and test for **small phone viewports in general**, not one specific device — modern iPhones and
Android phones span roughly **320–430px** of CSS width (iPhone SE ≈ 375px, many Androids ≈ 360px,
larger phones ≈ 414–430px).

- **No horizontal overflow at any width in that range.** The layout must never extend past the
  viewport edge or require sideways scrolling. ~320px is the floor a layout must survive; verify at
  a narrow width, not just the default desktop window.
- **Layout bugs are invisible to the *unit* suite.** Vitest runs in jsdom with no real rendering, so
  overflow/wrapping/grid issues won't fail a Vitest test. Verify layout changes by eye in the browser
  at a narrow width (dev-tools device emulation), in addition to `tsc`/build/tests. For automated
  coverage, the Playwright e2e layer (`pnpm e2e`, [ADR-0008](docs/adr/0008-playwright-e2e-testing.md))
  renders the real app at a phone viewport and can assert against overflow and live interactions —
  add or extend an `e2e/*.spec.ts` check when a change materially affects layout.
- Prefer shrink-friendly layouts: `minmax(0, 1fr)` grid tracks, `min-width: 0` on flex/grid
  children that hold growable content (selects, long text), and `flex-wrap` on rows of controls.

### Open Props token scale is non-linear — check before you reach for a big number

The numbered `--size-*` / `--font-size-*` tokens do **not** scale linearly with their number, and
the jumps get large fast. Notably `--size-10` = 5rem, `--size-11` = 7.5rem, `--size-12` = 10rem
(160px) — a `min-width: var(--size-12)` is wide enough to overflow a phone row on its own. Don't
assume "a slightly bigger number" means "a slightly bigger size." Look up the actual value (Open
Props docs, or grep `node_modules/open-props`) before using anything above ~`--size-7`, especially
for `min-width`/`width` on mobile rows.

### Browser platform capabilities — feature-detect and degrade

Some features reach past the DOM for browser platform APIs (Screen Wake Lock, Web Audio,
`ResizeObserver`, …). See [ADR-0007](docs/adr/0007-live-session-browser-capabilities.md). This is a
phone-first PWA, so mind the mobile gotchas and always degrade gracefully:

- **Feature-detect, then no-op.** Guard every optional API (and its constructor) so the code is a
  safe no-op when it is missing. jsdom under Vitest has none of them, so unguarded use crashes the
  test suite as well as older browsers.
- **Web Audio must be unlocked by a user gesture.** iOS Safari (and Chrome's autoplay policy) only
  allow sound if the `AudioContext` is created/`resume()`d inside a real tap/click. Priming it from
  a timer or `requestAnimationFrame` callback does **not** count — the audio stays silent. Unlock it
  in the gesture handler (e.g. the Start button), then play the sound later.
- **Screen Wake Lock is dropped when the tab is hidden.** Re-acquire on `visibilitychange` if the
  activity is still active, and always release it when the activity ends (and in view cleanup) to
  save battery.
- **`requestAnimationFrame` display loops should idle.** Skip the per-frame DOM writes when nothing
  is changing (e.g. the stopwatch is stopped) instead of repainting at ~60fps on a phone.
- **Sticky layers share one offset contract.** The app header is `position: sticky; top: 0` and is
  exactly `--header-height` tall. Anything else that sticks (e.g. the session stopwatch) offsets by
  `top: var(--header-height)` in CSS — don't measure the header in JS.

## Domain model

The program has two exercises performed every session:

- **One-arm swings:** 100 reps as **10 sets of 10**, hands alternate (derived, not stored).
- **Turkish get-ups (TGU):** 10 reps as **10 sets of 1**, sides alternate, 5 per side (derived).

Weights are stored canonically in **kg** (`weightKg`); the UI is kg-only for now. The **Simple**
standard is the default goal — 32 kg (or 24 kg) swings and get-ups, swing block in 5:00, get-up
block in 10:00. These targets live in user **Settings**, not in code. Per-set timing is tracked in
full: every set records prescribed and actual rest, and a live stopwatch drives logging; block
durations are compared against the time standards.

```ts
type ExerciseKind = "swing" | "getup";

interface WorkSet {
  kind: ExerciseKind;
  weightKg: number;           // canonical kg; chosen per set — the core interaction
  reps: number;               // swings default 10; get-ups default 1
  prescribedRestSec: number;  // coach's target interval before this set
  actualRestSec?: number;     // logged rest actually taken
  workSec?: number;           // optional: time spent on the set itself
}

interface Session {
  id: string;
  date: string;               // ISO date
  swings: WorkSet[];          // typically length 10
  getups: WorkSet[];          // typically length 10
  swingBlockSec?: number;     // measured, vs 5:00 standard
  getupBlockSec?: number;     // measured, vs 10:00 standard
  notes?: string;
}

interface Settings {
  ownedBellsKg: number[];     // USER-configured inventory — never hard-coded
  goal: {
    swingTargetKg: number; getupTargetKg: number;
    swingStandardSec: number; getupStandardSec: number; // default 300 / 600
  };
  enforceOneVariableAtATime: boolean;                    // default true
}

interface ProgressionState {
  swing: { baseKg: number; nextKg: number; heavySets: number };  // heavySets 0..10
  getup: { baseKg: number; nextKg: number; heavyReps: number };  // heavyReps 0,2,…,10
}
```

## The coach (progression engine)

Lives in `domain/`, pure and fully unit-tested. Full rules in
[ADR-0006](docs/adr/0006-progression-coach.md). In brief:

- **Step-loading:** swap the next bell from `ownedBellsKg` into one set at a time. Swings advance one
  set (`heavySets` 0→10); get-ups advance a balanced **pair** (`heavyReps` 0→10 by 2). When all sets
  reach the heavier bell it becomes the new base and `nextKg` moves to the following owned bell. The
  coach only prescribes weights that exist in the user's inventory.
- **Weight advance is manual.** The coach signals readiness (standard met at the current
  configuration) but never advances on its own — the user confirms.
- **Rest is auto-computed from the standard.** The prescribed per-set interval is whatever hits the
  goal time (~30 s/set swings; ~60 s/rep get-ups). A fixed target, not a separately tuned axis.
- **One variable at a time is enforced.** Rest is pinned to the standard and weight is the only
  user-advanced lever, so the coach never changes two stressors in one session.
- **Goal:** default Simple; achieved when a full session at the target weight meets the time
  standard. Goal and inventory are Settings, not constants.

## Storage rules

- **Stored data must always remain usable — full forward and backward compatibility is
  non-negotiable.** This is the highest-priority storage constraint. Any session (or any other
  record) ever written by any version of the app must stay loadable by every later version: never
  drop, invalidate, or crash on it. Data written by a *newer* schema and read by an *older* build
  must also degrade gracefully rather than break. Converting/upgrading a record on read to fit the
  current shape is fine and expected — losing it, or refusing to open the app because of it, is not.
  When a change to the storage format can't preserve this, stop and raise it rather than shipping a
  breaking migration. See [ADR-0003](docs/adr/0003-localstorage-persistence.md).
- Persist under namespaced, versioned keys — at least `kb:v1:sessions`, `kb:v1:settings`
  (inventory + goal), and `kb:v1:progression` (per-exercise base/next/heavy counts).
- **Version the schema.** Store a `schemaVersion`; write migrations in `storage/` when it changes.
  Never silently drop data on an unrecognized version. Migrations only ever *convert* data to the
  current shape — they must be total (handle every prior shape and any unknown/optional fields) and
  must never discard a record they don't recognise.
- Export = serialize all app data to a single JSON file the user downloads. Import = validate,
  then replace or merge (decide and document the chosen semantics).
- Treat `localStorage` as fallible: wrap reads in try/catch, tolerate quota errors, never let a
  storage failure crash the app.

## Tooling & conventions

- **Package manager:** pnpm (lockfile: `pnpm-lock.yaml`). Run scripts as `pnpm <script>`.
- **Tests:** Vitest for unit/logic (`pnpm test`). Cover `domain/` (program rules, progression,
  migrations) thoroughly; those are the high-value, pure-logic targets. Playwright for e2e
  (`pnpm e2e`, [ADR-0008](docs/adr/0008-playwright-e2e-testing.md)): a thin real-browser layer for
  rendered layout and live interactions only — the things jsdom can't see. Specs live in `e2e/*.spec.ts`
  (separate from Vitest's `*.test.ts` in `src/**`/`test/**`); keep them few and focused, and don't
  duplicate pure-logic coverage there. E2E is its own task, not part of `pnpm build`.
- **Naming:** `kebab-case` files, `camelCase` values, `PascalCase` types. Modules export named
  symbols (avoid default exports).
- **No new runtime dependencies** without an ADR and a clear reason. Dev dependencies (Vite,
  Vitest, types) are fine. The whole point is to stay vanilla.
- Prefer small, pure functions. Keep DOM code at the edges. Computation that ends up inside a
  render or `requestAnimationFrame` closure (timing math, formatting, selection logic) belongs in a
  pure, named `*-timing`/`*-logic` helper module so it can be unit-tested without the DOM — e.g.
  `ui/session-timing.ts` next to `ui/session.ts`.

## Workflow for agents

- Match the style and structure of existing code once it exists.
- When a change is ambiguous about a *product/domain* rule, ask. When it's an *implementation*
  detail covered by the conventions above, just follow them.
- **Develop test-first (TDD).** Write a failing test that captures the desired behavior, watch it
  fail, then write the minimum code to make it pass, then refactor. This is especially important for
  `domain/` (program rules, progression, migrations) — the pure, high-value logic. Don't write
  production code without a failing test driving it. This applies to pure logic in the `ui/` layer
  too: extract it (see above) and drive it with tests rather than leaving it untested inside a view.
- Run `tsc`/build and tests before claiming a change works; report real output.
- **Review new features with a fresh agent.** When an agent finishes developing a new feature, have
  a separate agent review the design and implementation, acting as a Staff Engineer: check
  architectural fit (the ADRs above), correctness, test coverage, and simplicity. The reviewer must
  be a different agent than the one that wrote the code, so the review is independent.
- If you make a new architecture-level decision, add an ADR in `docs/adr/` and link it here.
- **Running multiple agents in parallel?** Use the local `worktree` skill so each agent works in
  an isolated git worktree instead of fighting over the main checkout. Acquire a slot, work in it,
  then release it back to the pool. Parallelism only pays off for **file-disjoint** work — a set of
  changes that all edit the same files (e.g. several UI tweaks that all touch `ui/session.ts` and
  `styles/components.css`) will just collide on merge; do those inline. This is about *isolating
  parallel agents*, distinct from the checklist discipline in [Multi-part requests](#multi-part-requests).

## Multi-part requests

- When a user gives more than one instruction, requirement, suggestion, or constraint in a single
  request, switch to a checklist-style working approach.
- Break the request into concrete checklist items, keep the items in the user's stated order when
  practical, and tick them off one by one as work progresses.
- Before finishing, review the checklist against the user's original request and explicitly account
  for any item that was not completed, changed, or deferred.

## Commands

- `pnpm dev` — Vite dev server
- `pnpm build` — typecheck + static production build to `dist/`
- `pnpm preview` — serve the built output
- `pnpm test` — Vitest (single run); `pnpm test:watch` for watch mode
- `pnpm e2e` — Playwright e2e/layout tests (headless, phone viewport); `pnpm e2e:headed` to watch it
  run. Auto-starts/reuses the dev server. First-time setup needs the browser:
  `pnpm exec playwright install chromium`.
- `pnpm typecheck` — `tsc --noEmit`

**Toolchain activation:** Node/pnpm are not on the default `PATH`. Node 24.18.0 is installed via
nvm and pnpm is provided by corepack. Prefix shell commands with:

```bash
export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"; nvm use 24.18.0 >/dev/null
```

then `pnpm <script>` works.
