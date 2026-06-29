# ADR-0004: Offline-first installable PWA

- Status: Accepted
- Date: 2026-06-29

## Context

The app is used at the gym, where network access may be poor or absent, on a phone. Because all
data is local already (ADR-0003), the only thing standing between the user and full offline use
is loading the app shell.

## Decision

Ship the app as an **installable, offline-first Progressive Web App**: a web app manifest plus a
service worker that caches the app shell (HTML/CSS/JS/icons) so it loads and runs with no
connection. The user can install it to their home screen.

## Consequences

- Requires a manifest, icons, and a service worker with a cache strategy (cache the shell;
  there is no remote data to sync).
- Must handle service-worker update flow so users get new versions (e.g. update-on-reload).
- Pairs naturally with static hosting (ADR-0002) — these are just additional static files.
- Test the offline path explicitly; a broken service worker can serve stale assets.
