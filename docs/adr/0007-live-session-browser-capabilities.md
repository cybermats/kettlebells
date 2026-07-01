# ADR-0007: Live-session browser capabilities, gracefully degraded

- Status: Accepted
- Date: 2026-07-01

## Context

The active-session screen is used on a phone at the gym, one-handed, mid-workout. To make it usable
there it reaches past the DOM for a few browser **platform** capabilities:

- **Screen Wake Lock** — keep the display awake so the lock screen doesn't interrupt a set.
- **Web Audio** — a synthesised "beep, beep, boop" set-due chime (no audio asset files, keeping the
  offline PWA payload tiny) so the user doesn't have to watch the clock.
- **A sticky stopwatch** — the timer stays reachable while the set list scrolls.

These APIs are not uniformly available (older browsers, and jsdom under Vitest has none of them) and
carry mobile-specific gotchas — most notably that iOS Safari only unlocks audio inside a real user
gesture, and that the OS drops a wake lock when the tab is hidden. We need a consistent stance so
these features enhance the experience without becoming crashes, silent failures, or battery drains.

## Decision

Use the platform APIs directly (no libraries — consistent with [ADR-0001](0001-vanilla-typescript-no-framework.md)
and the "no new runtime deps" rule; Wake Lock and Web Audio are platform, not dependencies), each
behind a small feature-detected helper that degrades to a safe no-op:

- **`ui/wake-lock.ts`** — a module-owned sentinel. Acquire on stopwatch Start; release on
  Pause/Reset/Finish and on view cleanup; re-acquire on `visibilitychange` while still wanted. No-op
  when `navigator.wakeLock` is absent.
- **`ui/beep.ts`** — lazily creates a single `AudioContext`. Because iOS/autoplay policy only permit
  sound when the context is created/`resume()`d inside a user gesture, it is **unlocked from the
  Start tap** (`unlockAudio()`); the chime itself (`playSetDue()`) then fires from the timer. No-op
  when `AudioContext` is unavailable.
- **Sticky timer via one CSS offset contract.** The app header is `position: sticky; top: 0` and is
  exactly `--header-height` tall; the stopwatch sticks at `top: var(--header-height)`. The offset is
  pure CSS — no JS measuring the header.
- **Idle rAF loop.** The stopwatch display loop skips per-frame DOM writes when the clock is stopped
  (with one final repaint on the running→stopped edge).

The pure timing arithmetic behind the display (block duration, remaining rest, active-set selection)
lives in `ui/session-timing.ts` and is unit-tested; the browser-capability glue stays thin.

## Consequences

- On a browser (or jsdom) lacking any of these APIs, the feature silently does nothing and nothing
  else breaks — tests run without stubbing platform globals.
- The audible chime — a headline feature — is only reliable because audio is unlocked from a gesture;
  any future sound must follow the same unlock-in-gesture rule, not play cold from a timer.
- `--header-height` is a **layout contract**: changing the header's size means updating that token so
  every sticky layer stays aligned. Don't reintroduce JS header measurement.
- Wake Lock lifecycle is tied to the stopwatch and to view cleanup; new activities that should keep
  the screen awake must acquire/release around their own lifecycle and handle `visibilitychange`.
- These conventions are summarised under "Browser platform capabilities" in `CLAUDE.md`; keep the two
  in sync.
