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

**Stored data must always remain usable — full forward and backward compatibility is
non-negotiable.** Because the only copy of a user's history lives on their device, the storage
format is an effectively permanent contract. Any record ever written by any version of the app must
stay loadable by every later version (converting it on read to the current shape is fine), and data
written by a newer schema must degrade gracefully when read by an older build rather than break.
Losing a record, or refusing to open, is never acceptable. A storage-format change that can't
preserve this is not shippable without a new ADR.

## Consequences

- No network requests for data; the app works fully offline (complements ADR-0004).
- Data is per-browser/per-device. Moving devices means export → import. This is acceptable and
  documented as a feature, not a bug.
- Schema must be **versioned** with migrations; migrations only ever *convert* data to the current
  shape. They must be total — handling every prior shape and any unknown/optional fields — and must
  never silently drop or invalidate a record they don't recognise.
- Forward/backward compatibility is a hard test target: migration tests must cover old→new upgrades
  and tolerate newer-than-current / unknown fields without data loss.
- `localStorage` access is treated as fallible (quota/availability) and wrapped defensively.
- If history ever outgrows `localStorage`'s size limits, revisit with a new ADR (e.g. IndexedDB).
