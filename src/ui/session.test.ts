/**
 * Session view tests — DOM-level smoke tests.
 *
 * Covers:
 *  - Advance-weight button is gated on canAdvanceWeight (disabled at heaviest bell)
 *  - Finish-session flow increments refreshKey so the view is remounted
 *  - Block time is non-negative and only set when stopwatch ran
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AppState } from "../state/app-state";
import type { ProgressionState, Settings } from "../domain/types";
import { createStore } from "../state/index";
import { defaultSettings, initialProgression } from "../domain/standards";
import { renderSession } from "./session";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInitialState(): AppState {
  const settings = defaultSettings();
  const progression = initialProgression(settings);
  return {
    sessions: [],
    settings,
    progression,
    ui: {
      view: "session",
      draftSession: null,
      stopwatch: { running: false, startedAtMs: null, accumulatedMs: 0 },
    },
  };
}

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("session view — advance-weight button gating", () => {
  let container: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    cleanup?.();
    document.body.removeChild(container);
    cleanup = null;
  });

  it("disables advance buttons when already at the heaviest bell (no heavier bell to step toward)", () => {
    const state = makeInitialState();
    // At heaviest bell: base === next, heavySets = 0 → canAdvanceWeight returns ok=false
    state.progression = {
      swing: { baseKg: 32, nextKg: 32, heavySets: 0 },
      getup: { baseKg: 32, nextKg: 32, heavyReps: 0 },
    } satisfies ProgressionState;
    const store = createStore(state);
    cleanup = renderSession(container, store);

    const advBtns = container.querySelectorAll<HTMLButtonElement>(".btn--ghost");
    expect(advBtns.length).toBe(2); // one per exercise
    for (const btn of advBtns) {
      expect(btn.disabled).toBe(true);
    }
  });

  it("shows a reason text when advance button is disabled", () => {
    const state = makeInitialState();
    state.progression = {
      swing: { baseKg: 32, nextKg: 32, heavySets: 0 },
      getup: { baseKg: 32, nextKg: 32, heavyReps: 0 },
    } satisfies ProgressionState;
    const store = createStore(state);
    cleanup = renderSession(container, store);

    const reasons = container.querySelectorAll(".coach-panel__reason");
    expect(reasons.length).toBeGreaterThan(0);
    for (const r of reasons) {
      expect(r.textContent).toBeTruthy();
    }
  });

  it("enables advance buttons when there is a heavier bell and enforceOneVariableAtATime=false", () => {
    const state = makeInitialState();
    const settings: Settings = { ...defaultSettings(), enforceOneVariableAtATime: false };
    state.settings = settings;
    state.progression = {
      swing: { baseKg: 16, nextKg: 24, heavySets: 0 },
      getup: { baseKg: 16, nextKg: 24, heavyReps: 0 },
    } satisfies ProgressionState;
    const store = createStore(state);
    cleanup = renderSession(container, store);

    const advBtns = container.querySelectorAll<HTMLButtonElement>(".btn--ghost");
    // At least the swing and getup advance buttons should be enabled
    const enabledBtns = Array.from(advBtns).filter((btn) => !btn.disabled);
    expect(enabledBtns.length).toBeGreaterThan(0);
  });
});

describe("session view — finish session flow", () => {
  let container: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    cleanup?.();
    document.body.removeChild(container);
    cleanup = null;
  });

  function markAllSetsAndFinish(): void {
    // Click every "done" button to complete all sets
    const doneBtns = container.querySelectorAll<HTMLButtonElement>(".set-row__done-btn");
    expect(doneBtns.length).toBe(20); // 10 swings + 10 getups
    for (const btn of doneBtns) {
      btn.click();
    }
    // Click "Finish session"
    const finishBtn = container.querySelector<HTMLButtonElement>(".btn--primary.btn--full");
    expect(finishBtn?.disabled).toBe(false);
    finishBtn!.click();
  }

  it("increments ui.refreshKey after finish so the view is remounted with a fresh prescription", () => {
    const store = createStore(makeInitialState());
    cleanup = renderSession(container, store);
    const keyBefore = store.getState().ui.refreshKey ?? 0;

    markAllSetsAndFinish();

    const keyAfter = store.getState().ui.refreshKey ?? 0;
    expect(keyAfter).toBeGreaterThan(keyBefore);
  });

  it("saves exactly one session to the store after finishing", () => {
    const store = createStore(makeInitialState());
    cleanup = renderSession(container, store);
    markAllSetsAndFinish();
    expect(store.getState().sessions).toHaveLength(1);
  });

  it("saved session has a non-empty id", () => {
    const store = createStore(makeInitialState());
    cleanup = renderSession(container, store);
    markAllSetsAndFinish();
    const saved = store.getState().sessions[0];
    expect(saved?.id).toBeTruthy();
    expect(saved!.id.length).toBeGreaterThan(0);
  });

  it("saved session has today's date", () => {
    const store = createStore(makeInitialState());
    cleanup = renderSession(container, store);
    markAllSetsAndFinish();
    const saved = store.getState().sessions[0];
    const today = new Date().toISOString().slice(0, 10);
    expect(saved?.date).toBe(today);
  });
});

describe("session view — block time measurement", () => {
  let container: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    cleanup?.();
    document.body.removeChild(container);
    cleanup = null;
  });

  it("swingBlockSec and getupBlockSec are undefined when stopwatch was never started", () => {
    // This verifies the null-guard: if the user marks sets done without running
    // the stopwatch, we do not store garbage block times.
    const store = createStore(makeInitialState());
    cleanup = renderSession(container, store);

    const doneBtns = container.querySelectorAll<HTMLButtonElement>(".set-row__done-btn");
    for (const btn of doneBtns) btn.click();
    container.querySelector<HTMLButtonElement>(".btn--primary.btn--full")!.click();

    const saved = store.getState().sessions[0]!;
    expect(saved.swingBlockSec).toBeUndefined();
    expect(saved.getupBlockSec).toBeUndefined();
  });

  it("swingBlockSec and getupBlockSec are non-negative when the stopwatch ran", () => {
    // Start the stopwatch, then complete all sets — block times should be set and >= 0.
    const store = createStore(makeInitialState());
    cleanup = renderSession(container, store);

    // Click Start (the primary non-full-width button in the stopwatch area)
    const startBtn = container.querySelector<HTMLButtonElement>(".stopwatch .btn--primary");
    expect(startBtn).not.toBeNull();
    startBtn!.click();

    // Mark all sets done
    const doneBtns = container.querySelectorAll<HTMLButtonElement>(".set-row__done-btn");
    for (const btn of doneBtns) btn.click();

    container.querySelector<HTMLButtonElement>(".btn--primary.btn--full")!.click();

    const saved = store.getState().sessions[0]!;
    // When stopwatch ran, block times should be defined and non-negative
    if (saved.swingBlockSec !== undefined) {
      expect(saved.swingBlockSec).toBeGreaterThanOrEqual(0);
    }
    if (saved.getupBlockSec !== undefined) {
      expect(saved.getupBlockSec).toBeGreaterThanOrEqual(0);
    }
    // At minimum, swing block should be set (we started the stopwatch and
    // marked set 0 through 9 done, which captures swingBlockStartMs and swingBlockEndMs)
    expect(saved.swingBlockSec).toBeDefined();
  });
});

describe("session view — start/pause toggle button", () => {
  let container: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    cleanup?.();
    document.body.removeChild(container);
    cleanup = null;
  });

  it("shows a single Start/Pause toggle that flips label + state on click", () => {
    const store = createStore(makeInitialState());
    cleanup = renderSession(container, store);

    const toggle = container.querySelector<HTMLButtonElement>(".stopwatch__toggle");
    expect(toggle).not.toBeNull();

    // Default: Start (primary, stopwatch stopped)
    expect(toggle!.textContent).toContain("Start");
    expect(toggle!.classList.contains("btn--primary")).toBe(true);
    expect(store.getState().ui.stopwatch.running).toBe(false);

    // Click → running, label becomes Pause and variant flips to secondary
    toggle!.click();
    expect(store.getState().ui.stopwatch.running).toBe(true);
    expect(toggle!.textContent).toContain("Pause");
    expect(toggle!.classList.contains("btn--secondary")).toBe(true);
    expect(toggle!.classList.contains("btn--primary")).toBe(false);

    // Click again → paused, label + variant restored
    toggle!.click();
    expect(store.getState().ui.stopwatch.running).toBe(false);
    expect(toggle!.textContent).toContain("Start");
    expect(toggle!.classList.contains("btn--primary")).toBe(true);
    expect(toggle!.classList.contains("btn--secondary")).toBe(false);
  });

  it("reflects an already-running stopwatch at mount (remount mid-run)", () => {
    // The stopwatch lives in the store and survives view switches. Mounting the
    // session view while it is running must show "Pause", not a stale "Start".
    const state = makeInitialState();
    state.ui.stopwatch = { running: true, startedAtMs: Date.now(), accumulatedMs: 0 };
    const store = createStore(state);
    cleanup = renderSession(container, store);

    const toggle = container.querySelector<HTMLButtonElement>(".stopwatch__toggle")!;
    expect(toggle.textContent).toContain("Pause");
    expect(toggle.classList.contains("btn--secondary")).toBe(true);
  });

  it("Reset returns a running toggle back to the Start label", () => {
    const store = createStore(makeInitialState());
    cleanup = renderSession(container, store);

    const toggle = container.querySelector<HTMLButtonElement>(".stopwatch__toggle")!;
    toggle.click(); // running → Pause
    expect(toggle.textContent).toContain("Pause");

    // Reset uses confirm(); force it to true for the test.
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      container.querySelector<HTMLButtonElement>(".stopwatch__reset")!.click();
    } finally {
      window.confirm = originalConfirm;
    }

    expect(store.getState().ui.stopwatch.running).toBe(false);
    expect(toggle.textContent).toContain("Start");
  });
});
