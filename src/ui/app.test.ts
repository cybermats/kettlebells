/**
 * UI smoke tests — app shell and view routing.
 *
 * These tests verify:
 *  - The app renders nav + active view
 *  - Nav clicks dispatch setView and switch views
 *  - Session view renders 10 swing sets + 10 getup sets
 *  - Each set has a weight picker limited to ownedBellsKg
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "../state/index";
import { setView } from "../state/index";
import type { AppState } from "../state/index";
import { defaultSettings, initialProgression } from "../domain/standards";
import { createApp } from "./app";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  div.id = "app";
  document.body.appendChild(div);
  return div;
}

function cleanupContainer(el: HTMLElement): void {
  document.body.removeChild(el);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createApp", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = makeContainer();
  });

  it("renders the app header", () => {
    const store = createStore(makeInitialState());
    const { mount } = createApp(store, container);
    mount();
    const header = container.querySelector(".app-header");
    expect(header).not.toBeNull();
    cleanupContainer(container);
  });

  it("renders a nav with 3 buttons", () => {
    const store = createStore(makeInitialState());
    const { mount } = createApp(store, container);
    mount();
    const btns = container.querySelectorAll(".app-nav__btn");
    expect(btns.length).toBe(3);
    cleanupContainer(container);
  });

  it("marks the active nav button with aria-current=page", () => {
    const store = createStore(makeInitialState()); // view = "session"
    const { mount } = createApp(store, container);
    mount();
    const active = container.querySelector("[aria-current='page']");
    expect(active).not.toBeNull();
    expect(active?.getAttribute("aria-label")).toBe("Session");
    cleanupContainer(container);
  });

  it("switches view when a nav button is clicked", () => {
    const store = createStore(makeInitialState());
    const { mount } = createApp(store, container);
    mount();

    const historyBtn = container.querySelector<HTMLButtonElement>("[aria-label='History']");
    expect(historyBtn).not.toBeNull();
    historyBtn!.click();

    expect(store.getState().ui.view).toBe("history");
    // aria-current should move to History
    const active = container.querySelector("[aria-current='page']");
    expect(active?.getAttribute("aria-label")).toBe("History");
    cleanupContainer(container);
  });
});

describe("session view", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = makeContainer();
  });

  it("renders 10 swing set rows", () => {
    const store = createStore(makeInitialState());
    const { mount } = createApp(store, container);
    mount();

    const swingRows = container.querySelectorAll(".set-row[data-kind='swing']");
    expect(swingRows.length).toBe(10);
    cleanupContainer(container);
  });

  it("renders 10 getup set rows", () => {
    const store = createStore(makeInitialState());
    const { mount } = createApp(store, container);
    mount();

    const getupRows = container.querySelectorAll(".set-row[data-kind='getup']");
    expect(getupRows.length).toBe(10);
    cleanupContainer(container);
  });

  it("each set has a weight picker with options matching ownedBellsKg", () => {
    const state = makeInitialState();
    // defaultSettings has [16, 24, 32]
    const ownedBells = state.settings.ownedBellsKg;
    const store = createStore(state);
    const { mount } = createApp(store, container);
    mount();

    const pickers = container.querySelectorAll<HTMLSelectElement>(".set-row select");
    expect(pickers.length).toBe(20); // 10 swings + 10 getups

    for (const picker of pickers) {
      const values = Array.from(picker.options).map((o) => parseFloat(o.value));
      expect(values).toEqual(ownedBells);
    }
    cleanupContainer(container);
  });

  it("weight picker options are limited to ownedBellsKg — a custom inventory", () => {
    const state = makeInitialState();
    state.settings = { ...state.settings, ownedBellsKg: [20, 28] };
    state.progression = initialProgression(state.settings);
    const store = createStore(state);
    const { mount } = createApp(store, container);
    mount();

    const pickers = container.querySelectorAll<HTMLSelectElement>(".set-row select");
    for (const picker of pickers) {
      const values = Array.from(picker.options).map((o) => parseFloat(o.value));
      expect(values).toEqual([20, 28]);
    }
    cleanupContainer(container);
  });
});

describe("setView action", () => {
  it("dispatches setView to change the active view", () => {
    const state = makeInitialState();
    const store = createStore(state);
    store.setState(setView("history"));
    expect(store.getState().ui.view).toBe("history");
    store.setState(setView("settings"));
    expect(store.getState().ui.view).toBe("settings");
    store.setState(setView("session"));
    expect(store.getState().ui.view).toBe("session");
  });
});
