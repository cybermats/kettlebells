/**
 * Lightweight runtime type guards for the persisted data model.
 *
 * Pragmatic shape + primitive-type checks — not a full schema library. Used by the
 * storage loaders (to reject corrupt data) and by the import pipeline (to reject
 * malformed import files).
 *
 * All guards are pure functions: no side effects, no throws.
 */

import type {
  ExerciseKind,
  ThemePreference,
  WorkSet,
  Session,
  Goal,
  Settings,
  ProgressionState,
  PersistedState,
} from "../domain/types";

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isExerciseKind(v: unknown): v is ExerciseKind {
  return v === "swing" || v === "getup";
}

function isThemePreference(v: unknown): v is ThemePreference {
  return v === "auto" || v === "light" || v === "dark";
}

// ---------------------------------------------------------------------------
// WorkSet / Session
// ---------------------------------------------------------------------------

function isWorkSet(v: unknown): v is WorkSet {
  if (!isObject(v)) return false;
  if (!isExerciseKind(v["kind"])) return false;
  if (typeof v["weightKg"] !== "number") return false;
  if (typeof v["reps"] !== "number") return false;
  if (typeof v["prescribedRestSec"] !== "number") return false;
  // exactOptionalPropertyTypes: optional fields are absent OR the correct primitive type.
  if ("actualRestSec" in v && typeof v["actualRestSec"] !== "number") return false;
  if ("workSec" in v && typeof v["workSec"] !== "number") return false;
  return true;
}

function isWorkSetArray(v: unknown): v is WorkSet[] {
  return Array.isArray(v) && v.every(isWorkSet);
}

export function isSession(v: unknown): v is Session {
  if (!isObject(v)) return false;
  if (typeof v["id"] !== "string") return false;
  if (typeof v["date"] !== "string") return false;
  if (!isWorkSetArray(v["swings"])) return false;
  if (!isWorkSetArray(v["getups"])) return false;
  if ("swingBlockSec" in v && typeof v["swingBlockSec"] !== "number") return false;
  if ("getupBlockSec" in v && typeof v["getupBlockSec"] !== "number") return false;
  if ("notes" in v && typeof v["notes"] !== "string") return false;
  return true;
}

export function isSessionArray(v: unknown): v is Session[] {
  return Array.isArray(v) && v.every(isSession);
}

// ---------------------------------------------------------------------------
// Goal / Settings
// ---------------------------------------------------------------------------

function isGoal(v: unknown): v is Goal {
  if (!isObject(v)) return false;
  if (typeof v["swingTargetKg"] !== "number") return false;
  if (typeof v["getupTargetKg"] !== "number") return false;
  if (typeof v["swingStandardSec"] !== "number") return false;
  if (typeof v["getupStandardSec"] !== "number") return false;
  return true;
}

export function isSettings(v: unknown): v is Settings {
  if (!isObject(v)) return false;
  if (
    !Array.isArray(v["ownedBellsKg"]) ||
    !(v["ownedBellsKg"] as unknown[]).every((x) => typeof x === "number")
  )
    return false;
  if (!isGoal(v["goal"])) return false;
  if (typeof v["enforceOneVariableAtATime"] !== "boolean") return false;
  if (!isThemePreference(v["theme"])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// ProgressionState
// ---------------------------------------------------------------------------

export function isProgressionState(v: unknown): v is ProgressionState {
  if (!isObject(v)) return false;
  const swing = v["swing"];
  const getup = v["getup"];
  if (!isObject(swing)) return false;
  if (!isObject(getup)) return false;
  if (typeof swing["baseKg"] !== "number") return false;
  if (typeof swing["nextKg"] !== "number") return false;
  if (typeof swing["heavySets"] !== "number") return false;
  if (typeof getup["baseKg"] !== "number") return false;
  if (typeof getup["nextKg"] !== "number") return false;
  if (typeof getup["heavyReps"] !== "number") return false;
  return true;
}

// ---------------------------------------------------------------------------
// PersistedState
// ---------------------------------------------------------------------------

export function isPersistedState(v: unknown): v is PersistedState {
  if (!isObject(v)) return false;
  if (typeof v["schemaVersion"] !== "number") return false;
  if (!isSessionArray(v["sessions"])) return false;
  if (!isSettings(v["settings"])) return false;
  if (!isProgressionState(v["progression"])) return false;
  return true;
}
