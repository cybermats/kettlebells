/**
 * Schema version management and migration chain.
 *
 * Design principles:
 *  - `migrate` advances a raw parsed blob through N→N+1 steps until it reaches
 *    `SCHEMA_VERSION`, then validates the final shape.
 *  - NEVER silently drop or zero-fill data. Any unrecognised / future version
 *    throws `UnsupportedSchemaError` so the caller can surface the problem.
 *  - To add a migration: bump `SCHEMA_VERSION` in types.ts, add a `vN → vN+1`
 *    entry to `MIGRATIONS`, and update the validator if the shape changed.
 */

import { SCHEMA_VERSION } from "../domain/types";
import type { PersistedState } from "../domain/types";
import { isPersistedState } from "./validators";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when the schema version in stored data is not understood by this build
 * of the app — either a future version (data from a newer app) or a gap in the
 * migration chain. The caller must surface this to the user; we never silently
 * discard data.
 */
export class UnsupportedSchemaError extends Error {
  public readonly version: unknown;

  constructor(version: unknown) {
    super(
      `Unsupported schema version: ${String(version)}. ` +
        `This build understands up to version ${SCHEMA_VERSION}. ` +
        `The data may have been created by a newer version of the app.`,
    );
    this.name = "UnsupportedSchemaError";
    this.version = version;
  }
}

// ---------------------------------------------------------------------------
// Migration chain
// ---------------------------------------------------------------------------

/**
 * Each entry migrates the raw blob from key version N to N+1.
 * The function receives the record at version N and must return a record that
 * is valid at version N+1 (including updating `schemaVersion`).
 */
type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Partial<Record<number, MigrationFn>> = {
  // v1 is the initial version — no prior versions exist, so nothing to add yet.
  // Example of a future migration:
  //   1: (raw) => ({ ...raw, schemaVersion: 2, newField: defaultValue }),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Advance a raw parsed blob through all necessary step-migrations to reach the
 * current `SCHEMA_VERSION`, then validate the final shape.
 *
 * @returns A valid `PersistedState` at `SCHEMA_VERSION`.
 * @throws {UnsupportedSchemaError} if the version is unrecognised or in the future.
 * @throws {Error} if the blob is not an object or fails shape validation after migration.
 */
export function migrate(raw: unknown): PersistedState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Cannot migrate: input must be a plain object.");
  }

  const obj = raw as Record<string, unknown>;
  const version = obj["schemaVersion"];

  if (typeof version !== "number") {
    throw new UnsupportedSchemaError(version);
  }

  // Future versions are not understood — refuse to silently downgrade.
  if (version > SCHEMA_VERSION) {
    throw new UnsupportedSchemaError(version);
  }

  // Walk the migration chain: v → v+1 → … → SCHEMA_VERSION.
  let current = obj;
  let v = version;

  while (v < SCHEMA_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) {
      // Gap in the migration chain — cannot reconstruct data.
      throw new UnsupportedSchemaError(version);
    }
    current = fn(current);
    v++;
  }

  // Validate the migrated blob matches the current PersistedState shape.
  if (!isPersistedState(current)) {
    throw new Error(
      `Data at schema version ${version} could not be validated as PersistedState ` +
        `after migration. The stored data may be corrupt.`,
    );
  }

  return current;
}

/**
 * Returns true if the raw blob declares the current schema version.
 * Useful for a fast pre-check before calling `migrate`.
 */
export function isCurrentVersion(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  return (raw as Record<string, unknown>)["schemaVersion"] === SCHEMA_VERSION;
}
