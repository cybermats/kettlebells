/**
 * Program constants and rest-derivation helpers for Simple & Sinister 2.0.
 *
 * All functions are pure; no DOM or storage dependencies.
 */

import type { Goal, Settings, ProgressionState } from "./types.js";

// ─── Program constants ────────────────────────────────────────────────────────

/** Number of swing sets per session. */
export const SWING_SETS = 10 as const;

/** Reps per swing set. */
export const SWING_REPS = 10 as const;

/** Number of get-up sets per session. */
export const GETUP_SETS = 10 as const;

/** Reps per get-up set. */
export const GETUP_REPS = 1 as const;

// ─── Rest derivation ─────────────────────────────────────────────────────────

/**
 * Prescribed rest between swing sets in seconds.
 * Distributes the goal block time evenly across the 10 sets.
 * e.g. 300s / 10 = 30s for the Simple standard.
 */
export function swingRestSec(goal: Goal): number {
  return Math.round(goal.swingStandardSec / SWING_SETS);
}

/**
 * Prescribed rest between get-up sets in seconds.
 * Distributes the goal block time evenly across the 10 sets.
 * e.g. 600s / 10 = 60s for the Simple standard.
 */
export function getupRestSec(goal: Goal): number {
  return Math.round(goal.getupStandardSec / GETUP_SETS);
}

// ─── Default settings ─────────────────────────────────────────────────────────

/**
 * Returns a fresh default Settings object for the Simple standard.
 * Owned bells: 16, 24, 32 kg.
 * Goal: 32 kg swings and get-ups, 5:00 swing block, 10:00 get-up block.
 */
export function defaultSettings(): Settings {
  return {
    ownedBellsKg: [16, 24, 32],
    goal: {
      swingTargetKg: 32,
      getupTargetKg: 32,
      swingStandardSec: 300,
      getupStandardSec: 600,
    },
    enforceOneVariableAtATime: true,
    theme: "auto",
  };
}

// ─── Initial progression ──────────────────────────────────────────────────────

/**
 * Returns a fresh ProgressionState for the given settings.
 * baseKg = first owned bell; nextKg = second owned bell (or same as base if only one).
 * Sorts and dedupes the inventory defensively so an unsorted or imported inventory
 * never yields baseKg > nextKg.
 */
export function initialProgression(settings: Settings): ProgressionState {
  // Sort and dedupe defensively — callers may supply unsorted or duplicate inventories.
  const bells = [...new Set(settings.ownedBellsKg)].sort((a, b) => a - b);
  const baseKg = bells[0]!;
  const nextKg = bells[1] ?? baseKg;
  return {
    swing: { baseKg, nextKg, heavySets: 0 },
    getup: { baseKg, nextKg, heavyReps: 0 },
  };
}
