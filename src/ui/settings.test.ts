/**
 * Settings view tests — export produces JSON, import wires up.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "../state/index";
import type { AppState } from "../state/index";
import { defaultSettings, initialProgression } from "../domain/standards";
import { exportAll } from "../storage/export-import";
import { renderSettings } from "./settings";

function makeInitialState(): AppState {
  const settings = defaultSettings();
  const progression = initialProgression(settings);
  return {
    sessions: [],
    settings,
    progression,
    ui: {
      view: "settings",
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

describe("settings view", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  it("renders the export button", () => {
    const store = createStore(makeInitialState());
    renderSettings(container, store);
    // Find Export JSON button specifically
    const allBtns = Array.from(container.querySelectorAll("button"));
    const exportBtn = allBtns.find((b) => b.textContent?.includes("Export JSON"));
    expect(exportBtn).not.toBeNull();
    document.body.removeChild(container);
  });

  it("renders the theme select with auto/light/dark options", () => {
    const store = createStore(makeInitialState());
    renderSettings(container, store);
    const themeSelect = container.querySelector<HTMLSelectElement>("#theme-select");
    expect(themeSelect).not.toBeNull();
    const values = Array.from(themeSelect!.options).map((o) => o.value);
    expect(values).toContain("auto");
    expect(values).toContain("light");
    expect(values).toContain("dark");
    document.body.removeChild(container);
  });

  it("renders bell chips for each owned bell", () => {
    const store = createStore(makeInitialState()); // bells: [16, 24, 32]
    renderSettings(container, store);
    const chips = container.querySelectorAll(".bell-chip");
    expect(chips.length).toBe(3);
    document.body.removeChild(container);
  });
});

describe("exportAll", () => {
  it("produces valid JSON with schemaVersion, sessions, settings, progression", () => {
    const settings = defaultSettings();
    const progression = initialProgression(settings);
    const json = exportAll({ sessions: [], settings, progression });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).toHaveProperty("schemaVersion");
    expect(parsed).toHaveProperty("sessions");
    expect(parsed).toHaveProperty("settings");
    expect(parsed).toHaveProperty("progression");
    expect(Array.isArray(parsed["sessions"])).toBe(true);
  });

  it("includes ownedBellsKg in settings", () => {
    const settings = defaultSettings();
    const progression = initialProgression(settings);
    const json = exportAll({ sessions: [], settings, progression });
    const parsed = JSON.parse(json) as { settings: { ownedBellsKg: number[] } };
    expect(parsed.settings.ownedBellsKg).toEqual([16, 24, 32]);
  });
});
