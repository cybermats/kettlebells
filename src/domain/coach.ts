/**
 * The progression engine ("coach") for the Simple & Sinister 2.0 program.
 *
 * All functions are pure: no DOM, no storage, no side effects.
 * Inputs are never mutated; all transitions return new objects.
 *
 * See docs/adr/0006-progression-coach.md for the authoritative rules.
 */

import type { ExerciseKind, Goal, Session, Settings, ProgressionState, WorkSet } from "./types.js";
import { SWING_SETS, SWING_REPS, GETUP_SETS, GETUP_REPS, swingRestSec, getupRestSec } from "./standards.js";

// ─── Inventory helpers ────────────────────────────────────────────────────────

/**
 * Returns the smallest owned bell strictly greater than `weightKg`,
 * or `undefined` if no such bell exists.
 * Input is sorted defensively to tolerate arbitrary ordering.
 */
export function nextOwnedAbove(ownedBellsKg: number[], weightKg: number): number | undefined {
  const sorted = [...ownedBellsKg].sort((a, b) => a - b);
  return sorted.find((bell) => bell > weightKg);
}

// ─── Session prescription ─────────────────────────────────────────────────────

/**
 * Prescribes the next session: per-set weights and rest intervals for swings
 * and get-ups, derived from the current ProgressionState and Settings.
 *
 * Swings: 10 sets of 10. The last `heavySets` sets use `nextKg`; the rest use `baseKg`.
 * Get-ups: 10 sets of 1. The last `heavyReps` sets use `nextKg`; the rest use `baseKg`.
 *   Sides alternate R,L,R,L,… Because heavyReps is always even, the trailing heavy
 *   block always contains equal R and L reps (balanced per side).
 *
 * Only weights from `ownedBellsKg` are ever emitted.
 */
export function prescribeSession(
  settings: Settings,
  progression: ProgressionState,
): { swings: WorkSet[]; getups: WorkSet[] } {
  const { goal } = settings;
  const swingRest = swingRestSec(goal);
  const getupRest = getupRestSec(goal);

  // Swings: trailing `heavySets` sets use nextKg
  const { baseKg: swingBase, nextKg: swingNext, heavySets } = progression.swing;
  const swings: WorkSet[] = Array.from({ length: SWING_SETS }, (_, i) => ({
    kind: "swing" as const,
    weightKg: i < SWING_SETS - heavySets ? swingBase : swingNext,
    reps: SWING_REPS,
    prescribedRestSec: swingRest,
  }));

  // Get-ups: trailing `heavyReps` sets use nextKg
  // Sides alternate R (even index), L (odd index). Because heavyReps is even,
  // the trailing block is automatically balanced: equal right and left sets.
  const { baseKg: getupBase, nextKg: getupNext, heavyReps } = progression.getup;
  const getups: WorkSet[] = Array.from({ length: GETUP_SETS }, (_, i) => ({
    kind: "getup" as const,
    weightKg: i < GETUP_SETS - heavyReps ? getupBase : getupNext,
    reps: GETUP_REPS,
    prescribedRestSec: getupRest,
  }));

  return { swings, getups };
}

// ─── Readiness detection ──────────────────────────────────────────────────────

/**
 * Signals whether each exercise is ready for a weight advance.
 * An exercise is ready iff the most-recent session has a block time defined
 * and at or within the time standard.
 * Returns `{ swing: false, getup: false }` when history is empty.
 */
export function readiness(
  history: Session[],
  settings: Settings,
): { swing: boolean; getup: boolean } {
  if (history.length === 0) {
    return { swing: false, getup: false };
  }
  const last = history[history.length - 1]!;
  const { goal } = settings;

  const swing =
    last.swingBlockSec !== undefined && last.swingBlockSec <= goal.swingStandardSec;
  const getup =
    last.getupBlockSec !== undefined && last.getupBlockSec <= goal.getupStandardSec;

  return { swing, getup };
}

// ─── Progression transitions ──────────────────────────────────────────────────

/**
 * Pure transition: advances the given exercise by one step.
 *
 * Swings: heavySets + 1. If the result reaches SWING_SETS (10), rolls over:
 *   baseKg ← nextKg, heavySets ← 0, nextKg ← nextOwnedAbove(owned, newBase) ?? newBase.
 *
 * Get-ups: heavyReps + 2. If the result reaches GETUP_SETS (10), same rollover.
 *
 * When already at the heaviest owned bell (nextKg === baseKg and heavy count would
 * roll back to 0), advancing is a safe no-op: nextKg stays equal to baseKg.
 * The caller should guard with `canAdvanceWeight` to avoid triggering this.
 *
 * Never mutates the input; always returns a new ProgressionState.
 */
export function advance(
  progression: ProgressionState,
  settings: Settings,
  exercise: ExerciseKind,
): ProgressionState {
  const owned = settings.ownedBellsKg;

  if (exercise === "swing") {
    const { baseKg, nextKg, heavySets } = progression.swing;
    const newHeavy = heavySets + 1;

    if (newHeavy >= SWING_SETS) {
      // Rollover: the heavier bell becomes the new base
      const newBase = nextKg;
      const newNext = nextOwnedAbove(owned, newBase) ?? newBase;
      return {
        ...progression,
        swing: { baseKg: newBase, nextKg: newNext, heavySets: 0 },
      };
    }

    return {
      ...progression,
      swing: { baseKg, nextKg, heavySets: newHeavy },
    };
  }

  // getup
  const { baseKg, nextKg, heavyReps } = progression.getup;
  const newHeavy = heavyReps + 2;

  if (newHeavy >= GETUP_SETS) {
    // Rollover
    const newBase = nextKg;
    const newNext = nextOwnedAbove(owned, newBase) ?? newBase;
    return {
      ...progression,
      getup: { baseKg: newBase, nextKg: newNext, heavyReps: 0 },
    };
  }

  return {
    ...progression,
    getup: { baseKg, nextKg, heavyReps: newHeavy },
  };
}

// ─── Guarded advance ──────────────────────────────────────────────────────────

/**
 * Checks whether advancing the given exercise is currently allowed.
 *
 * Returns `{ ok: false, reason }` when:
 *  - There is no heavier bell to step toward (already at the heaviest owned bell).
 *  - `settings.enforceOneVariableAtATime` is true and `readiness` for the exercise
 *    is not yet satisfied.
 *
 * Returns `{ ok: true }` otherwise.
 */
export function canAdvanceWeight(
  history: Session[],
  settings: Settings,
  progression: ProgressionState,
  exercise: ExerciseKind,
): { ok: true } | { ok: false; reason: string } {
  // Check whether there is a heavier bell to step toward.
  // "No heavier bell" means baseKg === nextKg and heavy count is 0 (fully at base,
  // and nextOwnedAbove returned nothing during the last rollover).
  const { baseKg, nextKg } = exercise === "swing" ? progression.swing : progression.getup;
  const heavyCount = exercise === "swing" ? progression.swing.heavySets : progression.getup.heavyReps;

  if (baseKg === nextKg && heavyCount === 0) {
    return { ok: false, reason: "Already at the heaviest owned bell; no heavier bell to advance to." };
  }

  // Enforce one variable at a time
  if (settings.enforceOneVariableAtATime) {
    const ready = readiness(history, settings);
    const isReady = exercise === "swing" ? ready.swing : ready.getup;
    if (!isReady) {
      return {
        ok: false,
        reason: `Not ready to advance ${exercise} weight: current pace has not met the time standard yet.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Attempts to advance the given exercise.
 * Checks `canAdvanceWeight` first; if allowed, calls `advance` and returns the
 * new progression. Returns `{ ok: false, reason }` if blocked.
 */
export function tryAdvance(
  history: Session[],
  settings: Settings,
  progression: ProgressionState,
  exercise: ExerciseKind,
): { ok: true; progression: ProgressionState } | { ok: false; reason: string } {
  const check = canAdvanceWeight(history, settings, progression, exercise);
  if (!check.ok) {
    return check;
  }
  return { ok: true, progression: advance(progression, settings, exercise) };
}

// ─── Goal detection ───────────────────────────────────────────────────────────

/**
 * Returns true iff the session constitutes a goal achievement:
 *  - Every swing set uses a weight >= goal.swingTargetKg
 *  - swingBlockSec is defined and <= goal.swingStandardSec
 *  - Every get-up set uses a weight >= goal.getupTargetKg
 *  - getupBlockSec is defined and <= goal.getupStandardSec
 */
export function goalReached(session: Session, goal: Goal): boolean {
  if (session.swingBlockSec === undefined || session.getupBlockSec === undefined) {
    return false;
  }
  if (session.swingBlockSec > goal.swingStandardSec) {
    return false;
  }
  if (session.getupBlockSec > goal.getupStandardSec) {
    return false;
  }
  for (const set of session.swings) {
    if (set.weightKg < goal.swingTargetKg) {
      return false;
    }
  }
  for (const set of session.getups) {
    if (set.weightKg < goal.getupTargetKg) {
      return false;
    }
  }
  return true;
}
