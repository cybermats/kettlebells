/**
 * Screen Wake Lock helper — keeps the phone display awake during an active
 * session so the lock screen doesn't interrupt a workout at the gym.
 *
 * Fully feature-detected and guarded: on browsers without the Wake Lock API
 * (or in jsdom under test) every function is a safe no-op. The module owns a
 * single sentinel; the browser may drop the lock when the tab is hidden, so
 * callers should wire `reacquireWakeLockIfWanted` to `visibilitychange`.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
}

interface WakeLockApi {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

let sentinel: WakeLockSentinelLike | null = null;
/** Whether the caller currently wants the lock held (drives re-acquisition). */
let wantLock = false;

function wakeLockApi(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { wakeLock?: WakeLockApi };
  return nav.wakeLock ?? null;
}

/** Request a screen wake lock. Safe no-op when unsupported or already held. */
export async function acquireWakeLock(): Promise<void> {
  wantLock = true;
  const api = wakeLockApi();
  if (!api) return;
  if (sentinel && !sentinel.released) return;
  try {
    const s = await api.request("screen");
    sentinel = s;
    // The system releases the lock when the document is hidden; clear our
    // reference so reacquireWakeLockIfWanted() can request a fresh one.
    s.addEventListener?.("release", () => {
      if (sentinel === s) sentinel = null;
    });
  } catch {
    // Denied (e.g. low battery, or no user activation) — degrade silently.
    sentinel = null;
  }
}

/** Release the wake lock and stop wanting it. Safe no-op when none held. */
export async function releaseWakeLock(): Promise<void> {
  wantLock = false;
  const s = sentinel;
  sentinel = null;
  if (!s || s.released) return;
  try {
    await s.release();
  } catch {
    // Ignore — nothing useful to do if release fails.
  }
}

/**
 * Re-acquire the lock if we still want it but the browser dropped it while the
 * document was hidden. Intended for a `visibilitychange` handler.
 */
export function reacquireWakeLockIfWanted(): void {
  if (typeof document === "undefined") return;
  if (wantLock && document.visibilityState === "visible" && (!sentinel || sentinel.released)) {
    void acquireWakeLock();
  }
}
