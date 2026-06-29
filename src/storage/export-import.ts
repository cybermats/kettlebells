/**
 * Backup / restore via JSON file (ADR-0003).
 *
 * Import semantics: REPLACE ALL.
 *   parseImport validates first. importReplaceAll validates BEFORE touching
 *   localStorage so a bad import never partially overwrites good data.
 *
 * `exportAll` and `parseImport` are pure (no localStorage access) and are the
 * primary targets for unit tests. `importReplaceAll` and `clearAll` are the
 * integration points that touch storage.
 */

import { SCHEMA_VERSION } from "../domain/types";
import type { Session, Settings, ProgressionState, PersistedState } from "../domain/types";
import { migrate } from "./migrations";
import { saveSessions, saveSettings, saveProgression, safeRemove } from "./storage";
import { SESSIONS_KEY, SETTINGS_KEY, PROGRESSION_KEY } from "./keys";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/** Thrown when an import file cannot be parsed, validated, or migrated. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

// ---------------------------------------------------------------------------
// Export (pure)
// ---------------------------------------------------------------------------

/**
 * Serialize all app data to a JSON string ready to be downloaded as a backup file.
 * Includes `schemaVersion: SCHEMA_VERSION`. Pure — the UI layer handles the download.
 */
export function exportAll(state: {
  sessions: Session[];
  settings: Settings;
  progression: ProgressionState;
}): string {
  const persisted: PersistedState = {
    schemaVersion: SCHEMA_VERSION,
    sessions: state.sessions,
    settings: state.settings,
    progression: state.progression,
  };
  return JSON.stringify(persisted, null, 2);
}

// ---------------------------------------------------------------------------
// Import (parse + validate, pure)
// ---------------------------------------------------------------------------

/**
 * Parse a JSON backup string, run migrations, and validate the result.
 *
 * Pure function — does NOT touch localStorage.
 *
 * @throws {ImportError} on malformed JSON, invalid shape, or unsupported schema version.
 */
export function parseImport(json: string): PersistedState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ImportError("Invalid JSON: the import file could not be parsed.");
  }

  try {
    return migrate(parsed);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ImportError(`Import validation failed: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * Remove all three kb:v1 keys from localStorage safely.
 * Does not throw on any failure.
 */
export function clearAll(): void {
  safeRemove(SESSIONS_KEY);
  safeRemove(SETTINGS_KEY);
  safeRemove(PROGRESSION_KEY);
}

// ---------------------------------------------------------------------------
// Import (replace all)
// ---------------------------------------------------------------------------

/**
 * Import semantics: REPLACE ALL.
 *
 * Parses and validates the JSON backup, then atomically replaces app data in
 * localStorage. Validation runs FIRST — if the import is invalid, storage is
 * untouched and the error is thrown before any data is erased.
 *
 * @returns The validated PersistedState that was written to localStorage.
 * @throws {ImportError} if the JSON is malformed, schema version is unsupported,
 *         or the data does not match the expected shape. Storage is untouched on throw.
 */
export function importReplaceAll(json: string): PersistedState {
  // Step 1: validate completely — throw BEFORE touching storage.
  const state = parseImport(json);

  // Step 2: wipe then write.
  clearAll();
  saveSessions(state.sessions);
  saveSettings(state.settings);
  saveProgression(state.progression);

  return state;
}
