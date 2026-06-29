/**
 * State container with tiny pub/sub.
 *
 * Usage:
 *   const store = createStore(initialState, { onChange: storage.save });
 *   const unsub = store.subscribe(renderFn);
 *   store.setState(setView("history"));
 *
 * Design notes:
 * - State is treated as immutable; setState receives an updater that must
 *   return a new object (never mutate `prev`).
 * - `onChange` is the persistence seam: pass storage's save function here.
 *   The store itself never imports storage.
 * - Listeners are iterated over a snapshot so a subscriber that calls
 *   unsubscribe() during notification does not corrupt the iteration.
 */
import type { AppState } from "./app-state";

/** Updater function: takes old state, returns new state. */
export type Updater = (prev: AppState) => AppState;

/** Unsubscribe function returned by subscribe(). */
export type Unsubscribe = () => void;

/** The public interface of the state container. */
export interface Store {
  /** Return the current immutable state snapshot. */
  getState(): AppState;
  /**
   * Apply an immutable update, then notify all subscribers and call
   * `onChange` (if provided at construction time).
   */
  setState(updater: Updater): void;
  /**
   * Register a listener that will be called with the new state after every
   * committed setState.  Returns an unsubscribe function.
   */
  subscribe(listener: (state: AppState) => void): Unsubscribe;
}

/** Options accepted by createStore. */
export interface StoreOptions {
  /**
   * Called with the new state after every committed setState.
   * Intended for the persistence layer (e.g. storage.save).
   * The store never imports storage directly — this is injected.
   */
  onChange?: (state: AppState) => void;
}

/**
 * Create a new Store with the given initial state.
 *
 * @param initialState - The starting AppState.
 * @param options - Optional hooks; `onChange` fires on every setState commit.
 */
export function createStore(
  initialState: AppState,
  options?: StoreOptions,
): Store {
  let current = initialState;
  const listeners = new Set<(state: AppState) => void>();

  function getState(): AppState {
    return current;
  }

  function setState(updater: Updater): void {
    const next = updater(current);
    current = next;

    // Iterate over a snapshot so self-unsubscribing listeners don't break
    // the loop.
    const snapshot = [...listeners];
    for (const listener of snapshot) {
      listener(next);
    }

    options?.onChange?.(next);
  }

  function subscribe(listener: (state: AppState) => void): Unsubscribe {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { getState, setState, subscribe };
}
