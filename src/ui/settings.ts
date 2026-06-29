/**
 * Settings view — edit bell inventory, goal targets, and theme.
 * Also handles JSON export/import (backup/restore).
 *
 * Editing is optimistic: each form control dispatches setSettings immediately
 * so the store (and localStorage) stay in sync. No separate Save button.
 */

import type { Store } from "../state/index";
import type { Settings, ThemePreference } from "../domain/types";
import { setSettings, setProgression, incrementRefreshKey } from "../state/index";
import { reconcileProgression } from "../domain/coach";
import { exportAll, importReplaceAll, ImportError } from "../storage/export-import";
import { applyTheme } from "./theme";
import { el, clear, formatSec } from "./dom";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Trigger a browser download of `content` as `filename`. */
function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Format seconds as "m:ss" for input default values. */
function secToMmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Parse "m:ss" back to total seconds. Returns NaN on bad input. */
function mmssToSec(value: string): number {
  const parts = value.trim().split(":");
  if (parts.length !== 2) return NaN;
  const m = parseInt(parts[0]!, 10);
  const s = parseInt(parts[1]!, 10);
  if (isNaN(m) || isNaN(s) || s < 0 || s > 59) return NaN;
  return m * 60 + s;
}

// ─── Main render function ─────────────────────────────────────────────────────

/** Mount the settings view into `container`. Returns a no-op cleanup (stateless view). */
export function renderSettings(container: HTMLElement, store: Store): () => void {
  const root = el("div", { class: "settings-view" });
  root.appendChild(el("h2", { class: "section-title" }, ["Settings"]));

  // ── Bell inventory ──────────────────────────────────────────────────────────

  const bellSection = el("div", { class: "settings-section" });
  bellSection.appendChild(el("p", { class: "settings-section__title" }, ["Bell inventory"]));

  const bellListEl = el("div", { class: "bell-list" });
  const importMsgEl = el("p", { class: "msg" });
  importMsgEl.setAttribute("hidden", "");

  function rebuildBellList(): void {
    clear(bellListEl);
    const { settings } = store.getState();
    for (const kg of settings.ownedBellsKg) {
      const chip = el("div", { class: "bell-chip" });
      chip.appendChild(document.createTextNode(`${kg} kg`));
      const rm = el("button", { class: "bell-chip__remove", type: "button", "aria-label": `Remove ${kg} kg bell` }, ["×"]);
      rm.addEventListener("click", () => {
        const { settings, progression } = store.getState();
        const next: Settings = {
          ...settings,
          ownedBellsKg: settings.ownedBellsKg.filter((b) => b !== kg),
        };
        // Reconcile progression so the coach never prescribes the removed bell.
        const nextProgression = reconcileProgression(progression, next);
        store.setState(setSettings(next));
        store.setState(setProgression(nextProgression));
        rebuildBellList();
      });
      chip.appendChild(rm);
      bellListEl.appendChild(chip);
    }
  }
  rebuildBellList();

  // Add bell row
  const addBellRow = el("div", { class: "settings-field" });
  const addBellLabel = el("label", { class: "settings-field__label", for: "add-bell-input" }, [
    "Add bell (kg)",
  ]);
  const addBellInput = el("input", {
    id: "add-bell-input",
    class: "settings-field__input",
    type: "number",
    placeholder: "e.g. 28",
    min: "4",
    max: "120",
    step: "2",
  });
  const addBellBtn = el("button", { class: "btn btn--secondary btn--sm", type: "button" }, ["Add"]);

  function addBell(): void {
    const value = parseFloat((addBellInput as HTMLInputElement).value);
    if (isNaN(value) || value <= 0) return;
    const { settings, progression } = store.getState();
    if (settings.ownedBellsKg.includes(value)) return; // already in list
    const next: Settings = {
      ...settings,
      ownedBellsKg: [...settings.ownedBellsKg, value].sort((a, b) => a - b),
    };
    // Reconcile progression so nextKg advances toward the newly added bell if applicable.
    const nextProgression = reconcileProgression(progression, next);
    store.setState(setSettings(next));
    store.setState(setProgression(nextProgression));
    (addBellInput as HTMLInputElement).value = "";
    rebuildBellList();
  }

  addBellBtn.addEventListener("click", addBell);
  addBellInput.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") addBell();
  });
  addBellRow.append(addBellLabel, addBellInput, addBellBtn);

  bellSection.append(bellListEl, addBellRow);

  // ── Goal targets ────────────────────────────────────────────────────────────

  const goalSection = el("div", { class: "settings-section" });
  goalSection.appendChild(el("p", { class: "settings-section__title" }, ["Goal targets"]));

  function numField(
    label: string,
    id: string,
    unit: string,
    getValue: (s: Settings) => number,
    setValue: (s: Settings, v: number) => Settings,
  ): HTMLElement {
    const field = el("div", { class: "settings-field" });
    field.appendChild(el("label", { class: "settings-field__label", for: id }, [`${label} (${unit})`]));
    const inp = el("input", {
      id,
      class: "settings-field__input",
      type: "number",
      min: "4",
      max: "120",
      step: "2",
      value: String(getValue(store.getState().settings)),
    });
    inp.addEventListener("change", () => {
      const v = parseFloat((inp as HTMLInputElement).value);
      if (!isNaN(v) && v > 0) {
        store.setState(setSettings(setValue(store.getState().settings, v)));
      }
    });
    field.appendChild(inp);
    return field;
  }

  goalSection.appendChild(numField(
    "Swing target",
    "goal-swing-kg",
    "kg",
    (s) => s.goal.swingTargetKg,
    (s, v) => ({ ...s, goal: { ...s.goal, swingTargetKg: v } }),
  ));
  goalSection.appendChild(numField(
    "Get-up target",
    "goal-getup-kg",
    "kg",
    (s) => s.goal.getupTargetKg,
    (s, v) => ({ ...s, goal: { ...s.goal, getupTargetKg: v } }),
  ));

  // Time standards (m:ss)
  function timeField(
    label: string,
    id: string,
    getValue: (s: Settings) => number,
    setValue: (s: Settings, v: number) => Settings,
  ): HTMLElement {
    const field = el("div", { class: "settings-field" });
    field.appendChild(el("label", { class: "settings-field__label", for: id }, [
      `${label} (m:ss — current: ${formatSec(getValue(store.getState().settings))})`,
    ]));
    const inp = el("input", {
      id,
      class: "settings-field__input",
      type: "text",
      placeholder: "m:ss",
      value: secToMmss(getValue(store.getState().settings)),
    });
    inp.addEventListener("change", () => {
      const v = mmssToSec((inp as HTMLInputElement).value);
      if (!isNaN(v) && v > 0) {
        store.setState(setSettings(setValue(store.getState().settings, v)));
      }
    });
    field.appendChild(inp);
    return field;
  }

  goalSection.appendChild(timeField(
    "Swing block standard",
    "goal-swing-std",
    (s) => s.goal.swingStandardSec,
    (s, v) => ({ ...s, goal: { ...s.goal, swingStandardSec: v } }),
  ));
  goalSection.appendChild(timeField(
    "Get-up block standard",
    "goal-getup-std",
    (s) => s.goal.getupStandardSec,
    (s, v) => ({ ...s, goal: { ...s.goal, getupStandardSec: v } }),
  ));

  // ── One-variable rule toggle ─────────────────────────────────────────────────

  const ruleSection = el("div", { class: "settings-section" });
  ruleSection.appendChild(el("p", { class: "settings-section__title" }, ["Progression rules"]));

  const toggleRow = el("div", { class: "toggle-row" });
  const toggleInput = el("input", { type: "checkbox", id: "enforce-one-var", role: "switch" });
  if (store.getState().settings.enforceOneVariableAtATime) {
    toggleInput.setAttribute("checked", "");
  }
  toggleInput.addEventListener("change", () => {
    const checked = (toggleInput as HTMLInputElement).checked;
    const s = store.getState().settings;
    store.setState(setSettings({ ...s, enforceOneVariableAtATime: checked }));
  });
  const toggleLabelEl = el("label", { for: "enforce-one-var", class: "toggle-row__label" }, [
    "Enforce one variable at a time",
  ]);
  toggleRow.append(toggleLabelEl, toggleInput);
  ruleSection.appendChild(toggleRow);

  // ── Theme ────────────────────────────────────────────────────────────────────

  const themeSection = el("div", { class: "settings-section" });
  themeSection.appendChild(el("p", { class: "settings-section__title" }, ["Theme"]));
  const themeField = el("div", { class: "settings-field" });
  themeField.appendChild(el("label", { class: "settings-field__label", for: "theme-select" }, ["Theme preference"]));
  const themeSelect = el("select", { id: "theme-select", class: "settings-field__input" });

  const themeOptions: Array<{ value: ThemePreference; label: string }> = [
    { value: "auto", label: "Auto (follow system)" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  const currentTheme = store.getState().settings.theme;
  for (const opt of themeOptions) {
    const optEl = el("option", { value: opt.value }, [opt.label]);
    if (opt.value === currentTheme) optEl.setAttribute("selected", "");
    themeSelect.appendChild(optEl);
  }

  themeSelect.addEventListener("change", () => {
    const value = (themeSelect as HTMLSelectElement).value as ThemePreference;
    const s = store.getState().settings;
    store.setState(setSettings({ ...s, theme: value }));
    applyTheme(value);
  });

  themeField.appendChild(themeSelect);
  themeSection.appendChild(themeField);

  // ── Backup / restore ─────────────────────────────────────────────────────────

  const backupSection = el("div", { class: "settings-section" });
  backupSection.appendChild(el("p", { class: "settings-section__title" }, ["Backup & restore"]));

  const backupRow = el("div", { class: "backup-row" });

  // Export button
  const exportBtn = el("button", { class: "btn btn--secondary", type: "button" }, ["Export JSON"]);
  exportBtn.addEventListener("click", () => {
    const s = store.getState();
    const json = exportAll({ sessions: s.sessions, settings: s.settings, progression: s.progression });
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(json, `kettlebells-backup-${date}.json`);
  });

  // Import: hidden file input + styled button
  const importFileInput = el("input", {
    type: "file",
    accept: ".json,application/json",
    "aria-label": "Import backup file",
    style: "display:none",
  });
  const importBtn = el("button", { class: "btn btn--secondary", type: "button" }, ["Import JSON"]);
  importBtn.addEventListener("click", () => {
    (importFileInput as HTMLInputElement).click();
  });

  importFileInput.addEventListener("change", () => {
    const file = (importFileInput as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      if (
        !confirm(
          "⚠️ Import will REPLACE ALL your current data (sessions, settings, progression). Are you sure?",
        )
      ) {
        (importFileInput as HTMLInputElement).value = "";
        return;
      }
      try {
        const result = importReplaceAll(text);
        // Reload the store from the new data
        store.setState((prev) => ({
          ...prev,
          sessions: result.sessions,
          settings: result.settings,
          progression: result.progression,
        }));
        applyTheme(result.settings.theme);
        // Force a remount of the current view so settings inputs reflect the new data.
        store.setState(incrementRefreshKey());
        showMsg("Import successful!", false);
      } catch (err) {
        const detail = err instanceof ImportError ? err.message : String(err);
        showMsg(`Import failed: ${detail}`, true);
      }
      (importFileInput as HTMLInputElement).value = "";
    };
    reader.readAsText(file);
  });

  backupRow.append(exportBtn, importBtn, importFileInput);
  backupSection.append(backupRow, importMsgEl);

  function showMsg(text: string, isError: boolean): void {
    importMsgEl.textContent = text;
    importMsgEl.className = `msg ${isError ? "msg--error" : "msg--success"}`;
    importMsgEl.removeAttribute("hidden");
  }

  root.append(bellSection, goalSection, ruleSection, themeSection, backupSection);
  clear(container).appendChild(root);

  return () => { /* stateless — nothing to clean up */ };
}
