/**
 * Shared domain contract for the Kettlebells app.
 *
 * This is the single source of truth for the data model used across every module
 * (`domain`, `storage`, `state`, `ui`). Treat it as a stable contract: changing a
 * type here ripples everywhere, so prefer additive changes and bump `SCHEMA_VERSION`
 * with a migration (see `storage/`) when the persisted shape changes.
 *
 * Weights are stored canonically in kilograms (`weightKg`). The UI is kg-only for now.
 */

export type ExerciseKind = "swing" | "getup";

/** One logged (or prescribed) set of work. */
export interface WorkSet {
  kind: ExerciseKind;
  /** Canonical kg; chosen per set — the core interaction (per-set weight control). */
  weightKg: number;
  /** Swings default 10; get-ups default 1. */
  reps: number;
  /** Coach's target rest interval before this set, in seconds. */
  prescribedRestSec: number;
  /** Logged rest actually taken, in seconds. */
  actualRestSec?: number;
  /** Optional: time spent on the set itself, in seconds. */
  workSec?: number;
}

/** A single training session: both exercises performed back to back. */
export interface Session {
  id: string;
  /** ISO date string. */
  date: string;
  /** One-arm swings — typically 10 sets of 10, hands alternate (derived). */
  swings: WorkSet[];
  /** Turkish get-ups — typically 10 sets of 1, sides alternate 5/side (derived). */
  getups: WorkSet[];
  /** Measured swing-block duration in seconds, compared vs the time standard. */
  swingBlockSec?: number;
  /** Measured get-up-block duration in seconds, compared vs the time standard. */
  getupBlockSec?: number;
  notes?: string;
}

/** The user's goal — defaults to the S&S "Simple" standard. */
export interface Goal {
  swingTargetKg: number;
  getupTargetKg: number;
  /** Swing-block time standard in seconds (default 300 = 5:00). */
  swingStandardSec: number;
  /** Get-up-block time standard in seconds (default 600 = 10:00). */
  getupStandardSec: number;
}

export type ThemePreference = "auto" | "light" | "dark";

/** User-configured settings. Inventory and goal live here, never hard-coded. */
export interface Settings {
  /** USER-configured bell inventory in kg, ascending. The coach only prescribes these. */
  ownedBellsKg: number[];
  goal: Goal;
  /** Enforce the "one stressor at a time" rule (default true). */
  enforceOneVariableAtATime: boolean;
  /** Theme preference; "auto" follows prefers-color-scheme (default "auto"). */
  theme: ThemePreference;
}

/** Per-exercise step-loading progression state. */
export interface ProgressionState {
  swing: {
    /** Current base bell (kg) — the weight most sets use. */
    baseKg: number;
    /** Next-heavier owned bell being stepped in (kg). */
    nextKg: number;
    /** How many of the 10 sets currently use `nextKg` (0..10). */
    heavySets: number;
  };
  getup: {
    baseKg: number;
    nextKg: number;
    /** How many of the 10 reps currently use `nextKg` (0,2,…,10 — balanced pairs). */
    heavyReps: number;
  };
}

/**
 * Current persisted schema version. Bump when the on-disk shape of any persisted
 * slice changes; add a migration in `storage/` and never silently drop data.
 */
export const SCHEMA_VERSION = 1 as const;

/**
 * The full persisted application state. This is exactly what export writes to a JSON
 * file and what import reads back (ADR-0003), wrapped with a version for migrations.
 */
export interface PersistedState {
  schemaVersion: number;
  sessions: Session[];
  settings: Settings;
  progression: ProgressionState;
}
