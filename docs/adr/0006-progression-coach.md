# ADR-0006: Opinionated progression coach

- Status: Accepted
- Date: 2026-06-29

## Context

The app's purpose is to help the user progress through Simple & Sinister 2.0 by controlling the
weight of each individual set (step-loading). The maintainer wants the app to be *opinionated*: it
should prescribe the next session, not just log history. This requires encoding the program's
progression rules, full per-set timing, and the timed standards.

## Decision

Build a pure **progression engine ("the coach")** in `domain/`. Given session history, the user's
**Settings** (owned bells, goal standard), and the current **ProgressionState**, it produces today's
prescription — per-set weights and per-set rest intervals — and a readiness signal.

Rules:

- **Step-loading, one set at a time.** Swap the next-heavier bell *from the user's own inventory*
  into one more set each advance. Swings advance a single set (`heavySets` 0→10); get-ups advance a
  balanced **pair** to keep sides even (`heavyReps` 0→10 by 2). When all sets reach the heavier bell,
  it becomes the new base and the target moves to the next owned bell. The coach only ever prescribes
  weights present in `ownedBellsKg`.
- **Weight advance is manual.** The coach surfaces a readiness signal (standard met at the current
  configuration) but does not advance on its own; the user confirms.
- **Rest auto-computed from the standard.** The prescribed per-set interval is whatever meets the
  goal time (≈30 s/set swings for 5:00; ≈60 s/rep get-ups for 10:00). It is a fixed target, not a
  separately tuned progression.
- **One variable at a time, enforced.** Because rest is pinned to the standard and weight is the only
  user-advanced lever, the coach never has the user change two stressors in one session, and it
  blocks/flags a weight advance taken before the current pace is met.
- **Goal-driven.** Default goal is the **Simple** standard. A goal is "achieved" when a full session
  at the target weight meets the time standard. Goal and inventory are **Settings**, never hard-coded.

## Consequences

- The coach is the highest-value test target: cover step-loading, the pair logic for get-ups, the
  base-advance rollover, inventory gaps, readiness detection, and one-variable enforcement.
- Full per-set timing must be modeled (prescribed + actual rest per set, block durations) and a live
  stopwatch UI is needed to capture it.
- The engine must be robust to arbitrary user inventories, including large gaps between owned bells.
- The progression rules are an interpretation of S&S 2.0 confirmed with the maintainer; if the rules
  are later refined, update this ADR rather than scattering changes.
- If goal/inventory/one-variable behavior needs to vary per user, expose them as Settings (the model
  already routes through Settings, so this is additive).
