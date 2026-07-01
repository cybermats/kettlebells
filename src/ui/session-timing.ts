/**
 * Pure timing helpers for the session view.
 *
 * These were extracted out of the render/rAF closure in `session.ts` so the
 * arithmetic — block duration, remaining rest, active-set selection — is unit
 * testable in isolation (no DOM, no stopwatch, no requestAnimationFrame).
 *
 * All durations are in the same units as the stopwatch: elapsed **ms** in,
 * whole **seconds** out (for the display), unless noted.
 */

/** Minimal shape needed to pick the active set — a set is either done or not. */
export interface DoneFlag {
  done: boolean;
}

/**
 * Duration of a timing block in whole seconds, or `null` when the block has not
 * started. Reads live while running (`endMs == null` → uses `nowMs`) and freezes
 * once an end mark is recorded. Clamped to ≥ 0 against out-of-order marks.
 */
export function blockDurationSec(
  startMs: number | null,
  endMs: number | null,
  nowMs: number,
): number | null {
  if (startMs === null) return null;
  return Math.max(0, Math.round(((endMs ?? nowMs) - startMs) / 1000));
}

/**
 * Seconds remaining before the current set is "due", relative to its prescribed
 * rest. Positive = still resting; ≤ 0 = overdue (the caller beeps and shows the
 * overdue state). `restedMs` is the stopwatch elapsed since the last set mark.
 */
export function remainingRestSec(prescribedRestSec: number, restedMs: number): number {
  return prescribedRestSec - restedMs / 1000;
}

/**
 * The active resting set across the two blocks: the first not-done swing, or —
 * once all swings are done — the first not-done get-up. Returns `null` when the
 * whole session is complete.
 *
 * Mirrors the "one variable at a time / swings then get-ups" session flow: the
 * user always works the swing block to completion before the get-up block.
 */
export function activeSet<T extends DoneFlag>(
  swings: readonly T[],
  getups: readonly T[],
): { kind: "swing" | "getup"; index: number; set: T } | null {
  const swingsDone = swings.every((d) => d.done);
  const drafts = swingsDone ? getups : swings;
  const kind = swingsDone ? "getup" : "swing";
  const index = drafts.findIndex((d) => !d.done);
  if (index < 0) return null;
  return { kind, index, set: drafts[index]! };
}
