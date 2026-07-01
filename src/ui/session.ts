/**
 * Session view — the core logging screen.
 *
 * Renders:
 *  - 10 swing sets + 10 get-up sets with per-set weight pickers
 *  - A live stopwatch that captures actualRestSec and swingBlockSec / getupBlockSec
 *  - A coach panel showing readiness and the advance-weight button
 *  - A "Finish session" button that builds a Session and dispatches addSession
 *
 * Block timing convention
 * ───────────────────────
 * Block duration is measured in **stopwatch elapsed time** (ms), not wall-clock
 * Date.now(), so pausing the stopwatch correctly excludes pause time from block
 * measurements and the two time sources never desync.
 *
 *  swingBlock  = [stopwatch start (elapsed=0), last swing set done]
 *  getupBlock  = [last swing set done, last getup set done]
 *
 * The swing block therefore includes the work done on swing set 0 (previously
 * omitted because start was recorded on set-0-done rather than stopwatch-start).
 *
 * Lifecycle:
 *  renderSession(container, store) — mounts the view once; sets up internal state.
 *  The returned cleanup function must be called when switching away.
 */

import type { Store } from "../state/index";
import type { Session, WorkSet, ExerciseKind } from "../domain/types";
import {
  addSession,
  startStopwatch,
  pauseStopwatch,
  resetStopwatch,
  setProgression,
  elapsedMs,
  incrementRefreshKey,
} from "../state/index";
import { prescribeSession, readiness, canAdvanceWeight, tryAdvance } from "../domain/coach";
import { swingRestSec, getupRestSec } from "../domain/standards";
import { el, clear, formatMs, formatSec } from "./dom";
import { acquireWakeLock, releaseWakeLock, reacquireWakeLockIfWanted } from "./wake-lock";
import { playSetDue, unlockAudio } from "./beep";
import { blockDurationSec, remainingRestSec, activeSet } from "./session-timing";

// ─── Side / hand label helpers ────────────────────────────────────────────────

/** Returns "R" or "L" for a swing set at the given 0-based index. */
function swingHand(index: number): string {
  return index % 2 === 0 ? "R" : "L";
}

/** Returns "R" or "L" for a get-up set at the given 0-based index. */
function getupSide(index: number): string {
  return index % 2 === 0 ? "R" : "L";
}

// ─── UUID helper ──────────────────────────────────────────────────────────────

/**
 * Generate a unique session id.
 * Falls back to a pseudo-random hex string when crypto.randomUUID() is unavailable
 * (e.g. non-secure contexts in some browsers).
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: 32 hex chars (128 bits of randomness via Math.random)
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0"),
  ).join("");
}

// ─── Draft set type ───────────────────────────────────────────────────────────

/** A mutable in-progress copy of a set that we accumulate while the user logs. */
interface DraftSet {
  base: WorkSet;
  weightKg: number;
  done: boolean;
  actualRestSec?: number;
  workSec?: number;
  /** Row element — so the live tick can toggle the active/overdue classes. */
  rowEl?: HTMLElement;
  /** Time cell — shows prescribed rest, then the live countdown, then the split. */
  timeEl?: HTMLElement;
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

  // ─── Block timing (stopwatch-elapsed, not wall-clock) ─────────────────────
  //
  // All block timestamps are stored as stopwatch elapsed-ms values so pausing
  // the stopwatch correctly excludes idle time.
  //
  //  swingBlock  = [swingBlockStartMs=0, swingBlockEndMs=elapsed when set 9 done]
  //  getupBlock  = [getupBlockStartMs=elapsed when last swing done,
  //                 getupBlockEndMs=elapsed when last getup done]
  let swingBlockStartMs: number | null = null; // set to 0 when stopwatch first starts
  let swingBlockEndMs: number | null = null;
  let getupBlockStartMs: number | null = null;
  let getupBlockEndMs: number | null = null;

  // Track the stopwatch reading at the start of each set's rest interval
  let lastMarkMs: number | null = null;

  // Set-due chime bookkeeping: one beep per set (keyed "kind:index"), reset on
  // stopwatch reset. Prevents the "overdue" state re-triggering every frame.
  const beepedKeys = new Set<string>();
  // The row currently highlighted as the active resting set (tick-managed).
  let activeRow: HTMLElement | null = null;

  // ─── DOM construction ────────────────────────────────────────────────────────

  const root = el("div", { class: "session-view" });

  // Stopwatch section
  const swTimeEl = el("span", { class: "stopwatch__time" }, ["0:00.0"]);
  // Single Start/Pause toggle: primary "▶ Start" while stopped, secondary
  // "⏸ Pause" while running. One button drives both transitions.
  const swToggleBtn = el("button", { class: "btn btn--primary stopwatch__toggle", type: "button" }, [
    "▶ Start",
  ]);
  const swResetBtn = el("button", { class: "btn btn--secondary btn--sm stopwatch__reset", type: "button" }, ["Reset"]);

  const swControls = el("div", { class: "stopwatch__controls" });
  swControls.append(swToggleBtn, swResetBtn);

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

    // Time cell — starts by showing the prescribed rest for this set, then the
    // live countdown while it is the active resting set, then the actual split
    // once the set is marked done. Updated by the tick loop / markSetDone.
    const timeEl = el("span", { class: "set-row__time" }, [
      `${formatSec(draft.base.prescribedRestSec)} rest`,
    ]);

    // Done button
    const doneBtn = el("button", { class: "set-row__done-btn", type: "button" }, ["✓"]);
    doneBtn.addEventListener("click", () => {
      markSetDone(draft, index, kind, row, doneBtn);
    });

    row.append(indexEl, labelEl, weightWrap, timeEl, doneBtn);
    draft.rowEl = row;
    draft.timeEl = timeEl;
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

    // Capture actual rest since last mark (using stopwatch elapsed for consistency)
    if (lastMarkMs !== null) {
      draft.actualRestSec = Math.round((currentElapsed - lastMarkMs) / 1000);
    }
    lastMarkMs = currentElapsed;

    // ── Block timing (stopwatch elapsed, not wall-clock) ──────────────────
    // swingBlock spans [swingBlockStartMs=0, elapsed-when-last-swing-done].
    // getupBlock spans [elapsed-when-last-swing-done, elapsed-when-last-getup-done].
    // Only record block times when the stopwatch has actually been started
    // (swingBlockStartMs is set to 0 in the start-button handler). Without
    // this guard, elapsedMs returns 0 even with a stopped clock and we'd
    // store getupBlockSec=0 when the user never ran the stopwatch.
    if (kind === "swing") {
      if (index === prescribedSwings.length - 1 && swingBlockStartMs !== null) {
        swingBlockEndMs = currentElapsed;
        // getup block starts immediately after swings finish (same elapsed value)
        getupBlockStartMs = currentElapsed;
      }
    } else {
      if (index === prescribedGetups.length - 1 && getupBlockStartMs !== null) {
        getupBlockEndMs = currentElapsed;
      }
    }

    draft.done = true;
    row.classList.add("set-row--done");
    row.classList.remove("set-row--active");
    btn.classList.add("set-row__done-btn--done");
    btn.disabled = true;
    btn.textContent = "✓";

    // Freeze this row's time cell to the actual split (interval since the
    // previous set was marked done). Undefined when the stopwatch never ran.
    if (draft.timeEl) {
      draft.timeEl.classList.remove("set-row__time--countdown", "set-row__time--overdue");
      draft.timeEl.classList.add("set-row__time--split");
      draft.timeEl.textContent =
        draft.actualRestSec !== undefined ? formatSec(draft.actualRestSec) : "—";
    }

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

  // Build swing sets
  const swingSection = el("section", { class: "session-block" });
  const swingTitle = el("h2", { class: "section-title" });
  const swingTitleLabel = el("span", { class: "section-title__label" }, ["🔄 Swings (10 × 10)"]);
  // Running block total vs the 5:00 standard, updated live by the tick loop.
  const swingTotalEl = el("span", { class: "section-title__total" }, [
    `—:— / ${formatSec(settings.goal.swingStandardSec)}`,
  ]);
  swingTitle.append(swingTitleLabel, swingTotalEl);
  const swingList = el("div", { class: "set-list" });
  for (let i = 0; i < swingDrafts.length; i++) {
    swingList.appendChild(buildSetRow(swingDrafts[i]!, i, "swing"));
  }
  swingSection.append(swingTitle, swingList);

  // Build getup sets
  const getupSection = el("section", { class: "session-block" });
  const getupTitle = el("h2", { class: "section-title" });
  const getupTitleLabel = el("span", { class: "section-title__label" }, ["🎯 Get-ups (10 × 1)"]);
  const getupTotalEl = el("span", { class: "section-title__total" }, [
    `—:— / ${formatSec(settings.goal.getupStandardSec)}`,
  ]);
  getupTitle.append(getupTitleLabel, getupTotalEl);
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

  // Reconcile the toggle with the store's running state at mount. The stopwatch
  // lives in the store and survives view switches, so remounting the session
  // view (e.g. History → Session mid-run) must not leave a running clock showing
  // a "▶ Start" button. (renderToggle is a hoisted declaration, defined below.)
  renderToggle(store.getState().ui.stopwatch.running);

  // ─── Stopwatch logic ─────────────────────────────────────────────────────────

  /** Sync the toggle button's label + variant to the running state. */
  function renderToggle(running: boolean): void {
    swToggleBtn.textContent = running ? "⏸ Pause" : "▶ Start";
    swToggleBtn.classList.toggle("btn--primary", !running);
    swToggleBtn.classList.toggle("btn--secondary", running);
  }

  swToggleBtn.addEventListener("click", () => {
    if (store.getState().ui.stopwatch.running) {
      // Running → pause.
      store.setState(pauseStopwatch(Date.now()));
      renderToggle(false);
      void releaseWakeLock();
      return;
    }
    // Stopped → start.
    store.setState(startStopwatch(Date.now()));
    renderToggle(true);
    // Record the start of the first mark interval and the swing block start.
    // Both are elapsed=0 at stopwatch start; this ensures the swing block spans
    // from the very beginning (including set 0's work), not from set-0-done.
    if (lastMarkMs === null) {
      lastMarkMs = 0;
      swingBlockStartMs = 0;
    }
    // Keep the phone awake while actively timing a session.
    void acquireWakeLock();
    // Unlock Web Audio from within this user gesture so the set-due chime can
    // sound later (iOS/autoplay policy won't allow it if first touched in a timer).
    unlockAudio();
  });

  swResetBtn.addEventListener("click", () => {
    if (!confirm("Reset the stopwatch?")) return;
    store.setState(resetStopwatch());
    renderToggle(false);
    lastMarkMs = null;
    swingBlockStartMs = null;
    swingBlockEndMs = null;
    getupBlockStartMs = null;
    getupBlockEndMs = null;
    beepedKeys.clear();
    // Restore any not-done rows whose time cell was mid-countdown/overdue back
    // to their prescribed-rest label, and drop the active highlight — otherwise
    // a stale "0:07 left" / "+0:05 over" lingers after the clock returns to 0:00.
    resetTimeCells();
    void releaseWakeLock();
  });

  /** Restore every not-done set's time cell to its prescribed-rest default. */
  function resetTimeCells(): void {
    if (activeRow) {
      activeRow.classList.remove("set-row--active");
      activeRow = null;
    }
    for (const draft of [...swingDrafts, ...getupDrafts]) {
      if (draft.done || !draft.timeEl) continue;
      draft.timeEl.classList.remove("set-row__time--countdown", "set-row__time--overdue");
      draft.timeEl.textContent = `${formatSec(draft.base.prescribedRestSec)} rest`;
    }
  }

  // ─── Live block-total display ────────────────────────────────────────────────
  //
  // Shows the running (or frozen) duration of each block against its standard,
  // e.g. "2:14 / 5:00". A block reads live while in progress and freezes once
  // its end mark is recorded.
  function renderBlockTotal(
    el_: HTMLElement,
    startMs: number | null,
    endMs: number | null,
    standardSec: number,
    elapsed: number,
  ): void {
    const durSec = blockDurationSec(startMs, endMs, elapsed);
    if (durSec === null) {
      el_.textContent = `—:— / ${formatSec(standardSec)}`;
      el_.classList.remove("section-title__total--over");
      return;
    }
    el_.textContent = `${formatSec(durSec)} / ${formatSec(standardSec)}`;
    el_.classList.toggle("section-title__total--over", durSec > standardSec);
  }

  // ─── Live per-set countdown + set-due chime ──────────────────────────────────
  //
  // The active resting set is the first not-yet-done set in the current block.
  // While the stopwatch runs we count down its prescribed rest; at zero we play
  // beep-beep-boop (once) and flip the row into an "overdue" state.
  function updateActiveSet(elapsed: number, running: boolean): void {
    const current = activeSet(swingDrafts, getupDrafts);

    if (!running || lastMarkMs === null || !current || !current.set.timeEl) {
      if (activeRow) {
        activeRow.classList.remove("set-row--active");
        activeRow = null;
      }
      return;
    }

    const active = current.set;
    const timeEl = current.set.timeEl;

    // Highlight the active row (moving the highlight if it changed).
    if (activeRow !== active.rowEl) {
      if (activeRow) activeRow.classList.remove("set-row--active");
      active.rowEl?.classList.add("set-row--active");
      activeRow = active.rowEl ?? null;
    }

    const remainingSec = remainingRestSec(active.base.prescribedRestSec, elapsed - lastMarkMs);
    if (remainingSec > 0) {
      timeEl.classList.add("set-row__time--countdown");
      timeEl.classList.remove("set-row__time--overdue");
      timeEl.textContent = `${formatSec(Math.ceil(remainingSec))} left`;
    } else {
      timeEl.classList.remove("set-row__time--countdown");
      timeEl.classList.add("set-row__time--overdue");
      timeEl.textContent = `+${formatSec(Math.floor(-remainingSec))} over`;
      const key = `${current.kind}:${current.index}`;
      if (!beepedKeys.has(key)) {
        beepedKeys.add(key);
        playSetDue();
      }
    }
  }

  // Ticking display — requestAnimationFrame loop.
  // The display only changes while the stopwatch runs, so we skip the per-frame
  // DOM writes when it's idle (with one final repaint on the running→stopped
  // edge to freeze the last values). Avoids needless main-thread/battery work
  // when the session screen is left open on a phone.
  let rafId = 0;
  let wasRunning = false;
  function tick(): void {
    const sw = store.getState().ui.stopwatch;
    if (sw.running || wasRunning) {
      const ms = elapsedMs(sw, Date.now());
      swTimeEl.textContent = formatMs(ms);
      renderBlockTotal(swingTotalEl, swingBlockStartMs, swingBlockEndMs, settings.goal.swingStandardSec, ms);
      renderBlockTotal(getupTotalEl, getupBlockStartMs, getupBlockEndMs, settings.goal.getupStandardSec, ms);
      updateActiveSet(ms, sw.running);
      wasRunning = sw.running;
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  // ─── Keep the phone awake across tab-hide while a session is running ──────────
  function onVisibilityChange(): void {
    reacquireWakeLockIfWanted();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  // The sticky stopwatch offsets below the header purely in CSS via
  // `top: var(--header-height)` — no JS measurement needed (see .stopwatch).

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
      const canAdvance = canAdvanceWeight(sessions, settings, progression, kind);

      const row = el("div", { class: "coach-panel__row" });
      const label = el("span", { class: "coach-panel__label" }, [
        kind === "swing" ? "Swings" : "Get-ups",
      ]);
      const statusEl = el("span", {
        class: `coach-panel__status ${isReady ? "coach-panel__status--ready" : "coach-panel__status--not-ready"}`,
      }, [isReady ? "Ready to advance" : "Keep at current weight"]);

      row.append(label, statusEl);

      // Detail line: last session's block time vs the goal standard, plus the
      // per-set rest the coach is prescribing — explains why it is/ isn't ready.
      const { goal } = settings;
      const last = sessions.length > 0 ? sessions[sessions.length - 1] : undefined;
      const lastBlockSec = kind === "swing" ? last?.swingBlockSec : last?.getupBlockSec;
      const goalSec = kind === "swing" ? goal.swingStandardSec : goal.getupStandardSec;
      const restSec = kind === "swing" ? swingRestSec(goal) : getupRestSec(goal);
      const lastStr = lastBlockSec !== undefined ? `last ${formatSec(lastBlockSec)} / ` : "";
      const detailEl = el("p", { class: "coach-panel__detail" }, [
        `${lastStr}goal ${formatSec(goalSec)} · ${restSec}s/set`,
      ]);
      row.appendChild(detailEl);

      // Gate the button on canAdvanceWeight (not readiness alone), so it is
      // disabled when the user is already at the heaviest bell or blocked by
      // another reason. Show the reason as text when disabled.
      const advBtn = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, [
        `Advance ${kind} weight`,
      ]);
      if (!canAdvance.ok) {
        (advBtn as HTMLButtonElement).disabled = true;
        const reasonEl = el("p", { class: "coach-panel__reason" }, [canAdvance.reason]);
        row.appendChild(reasonEl);
      }
      advBtn.addEventListener("click", () => handleAdvance(kind, advBtn as HTMLButtonElement, panel));
      row.appendChild(advBtn);

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
    const id = generateId();
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

    // Block times: use stopwatch-elapsed diffs (consistent with rest timing).
    // Clamp to >= 0 to guard against any edge-case out-of-order marks.
    if (swingBlockStartMs !== null && swingBlockEndMs !== null) {
      session.swingBlockSec = Math.max(0, Math.round((swingBlockEndMs - swingBlockStartMs) / 1000));
    }
    if (getupBlockStartMs !== null && getupBlockEndMs !== null) {
      session.getupBlockSec = Math.max(0, Math.round((getupBlockEndMs - getupBlockStartMs) / 1000));
    }

    store.setState(addSession(session));
    store.setState(resetStopwatch());
    void releaseWakeLock();
    // Increment the refresh key so app.ts remounts this view with a fresh
    // prescription for the next session rather than showing the completed one.
    store.setState(incrementRefreshKey());
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  return function cleanup(): void {
    cancelAnimationFrame(rafId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    void releaseWakeLock();
  };
}
