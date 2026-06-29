/**
 * Session view — the core logging screen.
 *
 * Renders:
 *  - 10 swing sets + 10 get-up sets with per-set weight pickers
 *  - A live stopwatch that captures actualRestSec and swingBlockSec / getupBlockSec
 *  - A coach panel showing readiness and the advance-weight button
 *  - A "Finish session" button that builds a Session and dispatches addSession
 *
 * Lifecycle:
 *  renderSession(container, store) — mounts the view once; sets up internal state.
 *  The returned cleanup function must be called when navigating away.
 */

import type { Store } from "../state/index";
import type { Session, WorkSet, ExerciseKind } from "../domain/types";
import {
  addSession,
  setDraftSession,
  startStopwatch,
  pauseStopwatch,
  resetStopwatch,
  setProgression,
  elapsedMs,
} from "../state/index";
import { prescribeSession, readiness, tryAdvance } from "../domain/coach";
import { el, clear, formatMs, formatSec } from "./dom";

// ─── Side / hand label helpers ────────────────────────────────────────────────

/** Returns "R" or "L" for a swing set at the given 0-based index. */
function swingHand(index: number): string {
  return index % 2 === 0 ? "R" : "L";
}

/** Returns "R" or "L" for a get-up set at the given 0-based index. */
function getupSide(index: number): string {
  return index % 2 === 0 ? "R" : "L";
}

// ─── Draft set type ───────────────────────────────────────────────────────────

/** A mutable in-progress copy of a set that we accumulate while the user logs. */
interface DraftSet {
  base: WorkSet;
  weightKg: number;
  done: boolean;
  actualRestSec?: number;
  workSec?: number;
}

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * Mount the session view into `container`.
 * Returns a cleanup function; call it when switching away.
 */
export function renderSession(container: HTMLElement, store: Store): () => void {
  const state = store.getState();
  const { settings, progression, sessions } = state;

  // Derive fresh prescription
  const { swings: prescribedSwings, getups: prescribedGetups } = prescribeSession(
    settings,
    progression,
  );

  // Mutable per-set draft arrays
  const swingDrafts: DraftSet[] = prescribedSwings.map((ws) => ({
    base: ws,
    weightKg: ws.weightKg,
    done: false,
  }));
  const getupDrafts: DraftSet[] = prescribedGetups.map((ws) => ({
    base: ws,
    weightKg: ws.weightKg,
    done: false,
  }));

  // Phase tracking for block timing
  let swingStartMs: number | null = null;
  let swingEndMs: number | null = null;
  let getupStartMs: number | null = null;
  let getupEndMs: number | null = null;
  // Track the stopwatch reading at the start of each set's rest interval
  let lastMarkMs: number | null = null;

  // ─── DOM construction ────────────────────────────────────────────────────────

  const root = el("div", { class: "session-view" });

  // Stopwatch section
  const swTimeEl = el("span", { class: "stopwatch__time" }, ["0:00.0"]);
  const swStartBtn = el("button", { class: "btn btn--primary", type: "button" }, ["▶ Start"]);
  const swPauseBtn = el("button", { class: "btn btn--secondary", type: "button" }, ["⏸ Pause"]);
  const swResetBtn = el("button", { class: "btn btn--secondary btn--sm", type: "button" }, ["Reset"]);
  swPauseBtn.disabled = true;

  const swControls = el("div", { class: "stopwatch__controls" });
  swControls.append(swStartBtn, swPauseBtn, swResetBtn);

  const swWrap = el("div", { class: "stopwatch" });
  swWrap.append(swTimeEl, swControls);

  // Status message
  const statusMsg = el("p", { class: "msg" });
  statusMsg.setAttribute("hidden", "");

  // Build set row for one DraftSet
  function buildSetRow(draft: DraftSet, index: number, kind: ExerciseKind): HTMLElement {
    const sideLabel = kind === "swing" ? swingHand(index) : getupSide(index);
    const row = el("div", { class: "set-row", "data-index": String(index), "data-kind": kind });

    const indexEl = el("span", { class: "set-row__index" }, [String(index + 1)]);

    const labelEl = el("span", { class: "set-row__label" });
    const sideSpan = el("span", { class: "set-row__side" }, [sideLabel]);
    labelEl.append(sideSpan);

    // Weight picker
    const weightWrap = el("span", { class: "set-row__weight" });
    const weightSel = el("select", { "aria-label": "Weight (kg)" });
    for (const kg of settings.ownedBellsKg) {
      const opt = el("option", { value: String(kg) }, [`${kg} kg`]);
      if (kg === draft.weightKg) {
        opt.setAttribute("selected", "");
      }
      weightSel.appendChild(opt);
    }
    weightSel.addEventListener("change", () => {
      draft.weightKg = parseFloat(weightSel.value);
    });
    weightWrap.appendChild(weightSel);

    // Rest label
    const restEl = el("span", { class: "set-row__rest" }, [
      `${formatSec(draft.base.prescribedRestSec)} rest`,
    ]);

    // Done button
    const doneBtn = el("button", { class: "set-row__done-btn", type: "button" }, ["✓"]);
    doneBtn.addEventListener("click", () => {
      markSetDone(draft, index, kind, row, doneBtn);
    });

    row.append(indexEl, labelEl, weightWrap, restEl, doneBtn);
    return row;
  }

  function markSetDone(
    draft: DraftSet,
    index: number,
    kind: ExerciseKind,
    row: HTMLElement,
    btn: HTMLButtonElement,
  ): void {
    if (draft.done) return;

    const nowMs = Date.now();
    const sw = store.getState().ui.stopwatch;
    const currentElapsed = elapsedMs(sw, nowMs);

    // Capture actual rest since last mark
    if (lastMarkMs !== null) {
      draft.actualRestSec = Math.round((currentElapsed - lastMarkMs) / 1000);
    }
    lastMarkMs = currentElapsed;

    // Block start/end tracking
    if (kind === "swing") {
      if (index === 0 && swingStartMs === null) swingStartMs = nowMs;
      if (index === prescribedSwings.length - 1) swingEndMs = nowMs;
    } else {
      if (index === 0 && getupStartMs === null) getupStartMs = nowMs;
      if (index === prescribedGetups.length - 1) getupEndMs = nowMs;
    }

    draft.done = true;
    row.classList.add("set-row--done");
    btn.classList.add("set-row__done-btn--done");
    btn.disabled = true;
    btn.textContent = "✓";

    // Update draft in store (builds interim Session shape)
    syncDraftToStore();

    // If all swings done, prompt user to move to getups
    const allSwingsDone = swingDrafts.every((d) => d.done);
    const allGetupsDone = getupDrafts.every((d) => d.done);

    if (allSwingsDone && !allGetupsDone) {
      showStatus("Swings done! Move on to Turkish get-ups.", false);
    }
    if (allGetupsDone && allSwingsDone) {
      showStatus("All sets done! Tap 'Finish session' when ready.", false);
      finishBtn.disabled = false;
    }
  }

  function syncDraftToStore(): void {
    const draftSession: Session = {
      id: "",
      date: new Date().toISOString().slice(0, 10),
      swings: swingDrafts.map((d) => {
        const ws: WorkSet = {
          kind: "swing",
          weightKg: d.weightKg,
          reps: d.base.reps,
          prescribedRestSec: d.base.prescribedRestSec,
        };
        if (d.actualRestSec !== undefined) ws.actualRestSec = d.actualRestSec;
        if (d.workSec !== undefined) ws.workSec = d.workSec;
        return ws;
      }),
      getups: getupDrafts.map((d) => {
        const ws: WorkSet = {
          kind: "getup",
          weightKg: d.weightKg,
          reps: d.base.reps,
          prescribedRestSec: d.base.prescribedRestSec,
        };
        if (d.actualRestSec !== undefined) ws.actualRestSec = d.actualRestSec;
        if (d.workSec !== undefined) ws.workSec = d.workSec;
        return ws;
      }),
    };
    store.setState(setDraftSession(draftSession));
  }

  // Build swing sets
  const swingSection = el("section", { class: "session-block" });
  const swingTitle = el("h2", { class: "section-title" }, ["🔄 Swings (10 × 10)"]);
  const swingList = el("div", { class: "set-list" });
  for (let i = 0; i < swingDrafts.length; i++) {
    swingList.appendChild(buildSetRow(swingDrafts[i]!, i, "swing"));
  }
  swingSection.append(swingTitle, swingList);

  // Build getup sets
  const getupSection = el("section", { class: "session-block" });
  const getupTitle = el("h2", { class: "section-title" }, ["🎯 Get-ups (10 × 1)"]);
  const getupList = el("div", { class: "set-list" });
  for (let i = 0; i < getupDrafts.length; i++) {
    getupList.appendChild(buildSetRow(getupDrafts[i]!, i, "getup"));
  }
  getupSection.append(getupTitle, getupList);

  // Coach panel
  const coachPanel = buildCoachPanel();

  // Finish section
  const finishSection = el("div", { class: "finish-section" });
  const finishBtn = el("button", { class: "btn btn--primary btn--full", type: "button" }, [
    "Finish session",
  ]);
  finishBtn.disabled = true;
  finishBtn.addEventListener("click", finishSession);
  finishSection.appendChild(finishBtn);

  root.append(swWrap, statusMsg, swingSection, getupSection, coachPanel, finishSection);
  clear(container).appendChild(root);

  // ─── Stopwatch logic ─────────────────────────────────────────────────────────

  swStartBtn.addEventListener("click", () => {
    store.setState(startStopwatch(Date.now()));
    swStartBtn.disabled = true;
    swPauseBtn.disabled = false;
    if (lastMarkMs === null) lastMarkMs = 0;
  });

  swPauseBtn.addEventListener("click", () => {
    store.setState(pauseStopwatch(Date.now()));
    swStartBtn.disabled = false;
    swPauseBtn.disabled = true;
  });

  swResetBtn.addEventListener("click", () => {
    if (!confirm("Reset the stopwatch?")) return;
    store.setState(resetStopwatch());
    swStartBtn.disabled = false;
    swPauseBtn.disabled = true;
    lastMarkMs = null;
  });

  // Ticking display — requestAnimationFrame loop
  let rafId = 0;
  function tick(): void {
    const sw = store.getState().ui.stopwatch;
    const ms = elapsedMs(sw, Date.now());
    swTimeEl.textContent = formatMs(ms);
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  // ─── Helper: show status message ─────────────────────────────────────────────

  function showStatus(msg: string, isError: boolean): void {
    statusMsg.textContent = msg;
    statusMsg.className = `msg ${isError ? "msg--error" : "msg--success"}`;
    statusMsg.removeAttribute("hidden");
  }

  // ─── Coach panel builder ─────────────────────────────────────────────────────

  function buildCoachPanel(): HTMLElement {
    const ready = readiness(sessions, settings);
    const panel = el("div", { class: "coach-panel" });
    const title = el("p", { class: "coach-panel__title" }, ["Coach"]);
    panel.appendChild(title);

    for (const kind of ["swing", "getup"] as const) {
      const isReady = kind === "swing" ? ready.swing : ready.getup;
      const row = el("div", { class: "coach-panel__row" });
      const label = el("span", { class: "coach-panel__label" }, [
        kind === "swing" ? "Swings" : "Get-ups",
      ]);
      const statusEl = el("span", {
        class: `coach-panel__status ${isReady ? "coach-panel__status--ready" : "coach-panel__status--not-ready"}`,
      }, [isReady ? "Ready to advance" : "Keep at current weight"]);

      row.append(label, statusEl);

      if (isReady) {
        const advBtn = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, [
          `Advance ${kind} weight`,
        ]);
        advBtn.addEventListener("click", () => handleAdvance(kind, advBtn, panel));
        row.appendChild(advBtn);
      }

      panel.appendChild(row);
    }

    return panel;
  }

  function handleAdvance(kind: ExerciseKind, btn: HTMLButtonElement, panel: HTMLElement): void {
    const currentState = store.getState();
    const result = tryAdvance(
      currentState.sessions,
      currentState.settings,
      currentState.progression,
      kind,
    );

    if (!result.ok) {
      // Show reason
      const existing = panel.querySelector(".coach-panel__reason");
      if (existing) existing.remove();
      const reasonEl = el("p", { class: "coach-panel__reason" }, [result.reason]);
      panel.appendChild(reasonEl);
      return;
    }

    const label = kind === "swing" ? "swing" : "get-up";
    if (!confirm(`Advance ${label} weight? This updates your progression.`)) return;

    store.setState(setProgression(result.progression));
    btn.disabled = true;
    btn.textContent = "✓ Advanced";

    // Remove any existing error
    const existing = panel.querySelector(".coach-panel__reason");
    if (existing) existing.remove();
  }

  // ─── Finish session ───────────────────────────────────────────────────────────

  function finishSession(): void {
    const id = crypto.randomUUID();
    const date = new Date().toISOString().slice(0, 10);

    const swings: WorkSet[] = swingDrafts.map((d) => {
      const ws: WorkSet = {
        kind: "swing",
        weightKg: d.weightKg,
        reps: d.base.reps,
        prescribedRestSec: d.base.prescribedRestSec,
      };
      if (d.actualRestSec !== undefined) ws.actualRestSec = d.actualRestSec;
      if (d.workSec !== undefined) ws.workSec = d.workSec;
      return ws;
    });

    const getups: WorkSet[] = getupDrafts.map((d) => {
      const ws: WorkSet = {
        kind: "getup",
        weightKg: d.weightKg,
        reps: d.base.reps,
        prescribedRestSec: d.base.prescribedRestSec,
      };
      if (d.actualRestSec !== undefined) ws.actualRestSec = d.actualRestSec;
      if (d.workSec !== undefined) ws.workSec = d.workSec;
      return ws;
    });

    const session: Session = { id, date, swings, getups };

    // Block times: use wall-clock diff when we have both endpoints
    if (swingStartMs !== null && swingEndMs !== null) {
      session.swingBlockSec = Math.round((swingEndMs - swingStartMs) / 1000);
    }
    if (getupStartMs !== null && getupEndMs !== null) {
      session.getupBlockSec = Math.round((getupEndMs - getupStartMs) / 1000);
    }

    store.setState(addSession(session));
    store.setState(setDraftSession(null));
    store.setState(resetStopwatch());

    showStatus("Session saved!", false);
    finishBtn.disabled = true;
    finishBtn.textContent = "✓ Saved";
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  return function cleanup(): void {
    cancelAnimationFrame(rafId);
  };
}
