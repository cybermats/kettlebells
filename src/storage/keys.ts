/**
 * Namespaced, versioned localStorage key constants.
 *
 * Key format: `kb:v<schemaVersion>:<slice>`. If `SCHEMA_VERSION` is bumped in types.ts,
 * these strings change automatically, so old data stays under the old keys until a
 * migration reads them (migration reads from old keys, writes to new keys).
 */

import { SCHEMA_VERSION } from "../domain/types";

export { SCHEMA_VERSION };

export const SESSIONS_KEY = `kb:v${SCHEMA_VERSION}:sessions` as const;
export const SETTINGS_KEY = `kb:v${SCHEMA_VERSION}:settings` as const;
export const PROGRESSION_KEY = `kb:v${SCHEMA_VERSION}:progression` as const;
