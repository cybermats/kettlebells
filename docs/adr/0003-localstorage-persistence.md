# ADR-0003: Client-only persistence with localStorage + JSON export/import

- Status: Accepted
- Date: 2026-06-29

## Context

A core product promise is that data stays local — no accounts, no server, no data leaks. The
data volume is small (sessions of ~20 sets each), but users need a way to back up and move data
since browser storage can be cleared.

## Decision

Persist all app data in **`localStorage`** under versioned, namespaced keys. Provide **manual
JSON export and import** as the backup/restore mechanism: export serializes all data to a
downloadable file; import validates and loads it.

## Consequences

- No network requests for data; the app works fully offline (complements ADR-0004).
- Data is per-browser/per-device. Moving devices means export → import. This is acceptable and
  documented as a feature, not a bug.
- Schema must be **versioned** with migrations; unrecognized versions must never silently drop
  data.
- `localStorage` access is treated as fallible (quota/availability) and wrapped defensively.
- If history ever outgrows `localStorage`'s size limits, revisit with a new ADR (e.g. IndexedDB).
