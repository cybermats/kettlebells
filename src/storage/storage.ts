/**
 * Safe, typed localStorage access.
 *
 * Rules:
 * - Every localStorage call is wrapped in try/catch.
 * - Public functions NEVER throw — callers get null / false on any failure.
 * - Typed loaders validate the parsed shape; invalid/absent data returns null,
 *   never a partial object or a default — the state layer supplies defaults.
 */

import type { Session, Settings, ProgressionState } from "../domain/types";
import { SESSIONS_KEY, SETTINGS_KEY, PROGRESSION_KEY } from "./keys";
import { isSessionArray, isSettings, isProgressionState } from "./validators";

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/** Read a raw string from localStorage. Returns null on absence or any error. */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a string to localStorage.
 * Returns false on any failure (quota exceeded, private-browsing restrictions, etc.).
 * Never throws.
 */
export function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Remove a key from localStorage. Silently ignores any error. */
export function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore — nothing caller can do about a failed remove
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadSlice<T>(key: string, guard: (v: unknown) => v is T): T | null {
  const raw = safeGet(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveSlice<T>(key: string, value: T): boolean {
  try {
    return safeSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Typed slice accessors
// ---------------------------------------------------------------------------

/** Load sessions from localStorage. Returns null when absent or unreadable/invalid. */
export function loadSessions(): Session[] | null {
  return loadSlice(SESSIONS_KEY, isSessionArray);
}

/** Persist sessions. Returns false on any write failure. Never throws. */
export function saveSessions(sessions: Session[]): boolean {
  return saveSlice(SESSIONS_KEY, sessions);
}

/** Load settings from localStorage. Returns null when absent or unreadable/invalid. */
export function loadSettings(): Settings | null {
  return loadSlice(SETTINGS_KEY, isSettings);
}

/** Persist settings. Returns false on any write failure. Never throws. */
export function saveSettings(settings: Settings): boolean {
  return saveSlice(SETTINGS_KEY, settings);
}

/** Load progression state. Returns null when absent or unreadable/invalid. */
export function loadProgression(): ProgressionState | null {
  return loadSlice(PROGRESSION_KEY, isProgressionState);
}

/** Persist progression state. Returns false on any write failure. Never throws. */
export function saveProgression(progression: ProgressionState): boolean {
  return saveSlice(PROGRESSION_KEY, progression);
}

// ---------------------------------------------------------------------------
// Convenience: load/save all slices at once (used by the state bootstrap layer)
// ---------------------------------------------------------------------------

/**
 * Load all persisted slices in one call.
 * - `sessions` defaults to `[]` when absent (empty history is a valid starting point).
 * - `settings` and `progression` return null when absent so the state layer can
 *   supply appropriate defaults without this module knowing about business rules.
 */
export function loadAll(): {
  sessions: Session[];
  settings: Settings | null;
  progression: ProgressionState | null;
} {
  return {
    sessions: loadSessions() ?? [],
    settings: loadSettings(),
    progression: loadProgression(),
  };
}

/**
 * Persist all slices in one call.
 * Returns true only if all three writes succeed; false if any fails.
 */
export function saveAll(state: {
  sessions: Session[];
  settings: Settings;
  progression: ProgressionState;
}): boolean {
  const r1 = saveSessions(state.sessions);
  const r2 = saveSettings(state.settings);
  const r3 = saveProgression(state.progression);
  return r1 && r2 && r3;
}
