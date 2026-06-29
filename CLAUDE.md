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

- Persist under namespaced, versioned keys — at least `kb:v1:sessions`, `kb:v1:settings`
  (inventory + goal), and `kb:v1:progression` (per-exercise base/next/heavy counts).
- **Version the schema.** Store a `schemaVersion`; write migrations in `storage/` when it changes.
  Never silently drop data on an unrecognized version.
- Export = serialize all app data to a single JSON file the user downloads. Import = validate,
  then replace or merge (decide and document the chosen semantics).
- Treat `localStorage` as fallible: wrap reads in try/catch, tolerate quota errors, never let a
  storage failure crash the app.

## Tooling & conventions

- **Package manager:** npm (use whatever lockfile exists once the project is scaffolded).
- **Tests:** Vitest. Cover `domain/` (program rules, progression, migrations) thoroughly; those
  are the high-value, pure-logic targets.
- **Naming:** `kebab-case` files, `camelCase` values, `PascalCase` types. Modules export named
  symbols (avoid default exports).
- **No new runtime dependencies** without an ADR and a clear reason. Dev dependencies (Vite,
  Vitest, types) are fine. The whole point is to stay vanilla.
- Prefer small, pure functions. Keep DOM code at the edges.

## Workflow for agents

- Match the style and structure of existing code once it exists.
- When a change is ambiguous about a *product/domain* rule, ask. When it's an *implementation*
  detail covered by the conventions above, just follow them.
- Run `tsc`/build and tests before claiming a change works; report real output.
- If you make a new architecture-level decision, add an ADR in `docs/adr/` and link it here.

## Commands

> The project is not scaffolded yet. Fill these in once `package.json` exists. Expected shape:

- `npm run dev` — Vite dev server
- `npm run build` — static production build to `dist/`
- `npm run preview` — serve the built output
- `npm test` — Vitest
- `npm run typecheck` — `tsc --noEmit`
