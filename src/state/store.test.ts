/**
 * Tests for store.ts — pub/sub state container.
 */
import { describe, it, expect, vi } from "vitest";
import { createStore } from "./store";
import type { AppState } from "./app-state";

function makeInitialState(): AppState {
  return {
    sessions: [],
    settings: {
      ownedBellsKg: [16, 20, 24],
      goal: {
        swingTargetKg: 32,
        getupTargetKg: 32,
        swingStandardSec: 300,
        getupStandardSec: 600,
      },
      enforceOneVariableAtATime: true,
      theme: "auto",
    },
    progression: {
      swing: { baseKg: 16, nextKg: 20, heavySets: 0 },
      getup: { baseKg: 16, nextKg: 20, heavyReps: 0 },
    },
    ui: {
      view: "session",
      draftSession: null,
      stopwatch: {
        running: false,
        startedAtMs: null,
        accumulatedMs: 0,
      },
    },
  };
}

describe("createStore — getState", () => {
  it("returns the initial state immediately", () => {
    const initial = makeInitialState();
    const store = createStore(initial);
    expect(store.getState()).toEqual(initial);
  });
});

describe("createStore — setState / immutability", () => {
  it("getState before and after setState are different objects", () => {
    const store = createStore(makeInitialState());
    const before = store.getState();
    store.setState((prev) => ({ ...prev, sessions: [] }));
    const after = store.getState();
    expect(before).not.toBe(after);
  });

  it("original snapshot is not mutated by subsequent setState", () => {
    const store = createStore(makeInitialState());
    const snapshot = store.getState();
    store.setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, view: "history" },
    }));
    expect(snapshot.ui.view).toBe("session");
    expect(store.getState().ui.view).toBe("history");
  });

  it("setState applies the updater result as the new state", () => {
    const store = createStore(makeInitialState());
    store.setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, view: "settings" },
    }));
    expect(store.getState().ui.view).toBe("settings");
  });
});

describe("createStore — subscribe / unsubscribe", () => {
  it("notifies a subscriber after setState", () => {
    const store = createStore(makeInitialState());
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState((prev) => ({ ...prev, sessions: [] }));
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(store.getState());
  });

  it("notifies multiple subscribers", () => {
    const store = createStore(makeInitialState());
    const l1 = vi.fn();
    const l2 = vi.fn();
    store.subscribe(l1);
    store.subscribe(l2);
    store.setState((prev) => ({ ...prev }));
    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
  });

  it("unsubscribe stops future notifications", () => {
    const store = createStore(makeInitialState());
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.setState((prev) => ({ ...prev }));
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribing once does not affect other listeners", () => {
    const store = createStore(makeInitialState());
    const l1 = vi.fn();
    const l2 = vi.fn();
    const unsub1 = store.subscribe(l1);
    store.subscribe(l2);
    unsub1();
    store.setState((prev) => ({ ...prev }));
    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledOnce();
  });

  it("a subscriber that unsubscribes itself during notification does not break iteration", () => {
    const store = createStore(makeInitialState());
    const aftermath = vi.fn();
    let unsub: () => void;
    // self-unsubscribing listener
    const selfUnsub = vi.fn(() => {
      unsub();
    });
    unsub = store.subscribe(selfUnsub);
    store.subscribe(aftermath);
    // Should not throw, and aftermath must still be called
    expect(() => store.setState((prev) => ({ ...prev }))).not.toThrow();
    expect(selfUnsub).toHaveBeenCalledOnce();
    expect(aftermath).toHaveBeenCalledOnce();
  });

  it("listener receives the new state, not the old one", () => {
    const store = createStore(makeInitialState());
    let received: AppState | null = null;
    store.subscribe((s) => {
      received = s;
    });
    store.setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, view: "history" },
    }));
    expect(received).not.toBeNull();
    // TS narrows `received` to null here (can't track mutation in callback),
    // so we use the non-null assertion after the explicit runtime null check above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(received!.ui.view).toBe("history");
  });
});

describe("createStore — onChange persistence seam", () => {
  it("onChange is called with the new state on every setState", () => {
    const onChange = vi.fn();
    const store = createStore(makeInitialState(), { onChange });
    store.setState((prev) => ({ ...prev, sessions: [] }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(store.getState());
  });

  it("onChange fires on each distinct setState call", () => {
    const onChange = vi.fn();
    const store = createStore(makeInitialState(), { onChange });
    store.setState((prev) => ({ ...prev }));
    store.setState((prev) => ({ ...prev }));
    store.setState((prev) => ({ ...prev }));
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("works without onChange option (no error)", () => {
    const store = createStore(makeInitialState());
    expect(() => store.setState((prev) => ({ ...prev }))).not.toThrow();
  });
});
