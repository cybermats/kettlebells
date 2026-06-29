/**
 * History view — list of completed sessions, newest-first.
 *
 * For each session shows:
 *  - Date
 *  - Swing weight summary (base → heaviest used)
 *  - Getup weight summary
 *  - Swing block time vs goal standard (met / over)
 *  - Getup block time vs goal standard (met / over)
 *  - Goal-reached badge (goalReached())
 */

import type { Store } from "../state/index";
import type { Session, Goal } from "../domain/types";
import { goalReached } from "../domain/coach";
import { el, clear, formatSec } from "./dom";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Unique weights used in a set array, sorted ascending, formatted as "16→24 kg". */
function weightSummary(sets: Session["swings"]): string {
  const kgs = [...new Set(sets.map((s) => s.weightKg))].sort((a, b) => a - b);
  if (kgs.length === 0) return "—";
  if (kgs.length === 1) return `${kgs[0]!} kg`;
  return `${kgs[0]!}→${kgs[kgs.length - 1]!} kg`;
}

/** Build one history card for a session. */
function buildCard(session: Session, goal: Goal): HTMLElement {
  const isGoal = goalReached(session, goal);

  const card = el("div", { class: "history-card" });

  // Date + badge
  const dateEl = el("span", { class: "history-card__date" }, [formatDate(session.date)]);
  card.appendChild(dateEl);

  if (isGoal) {
    const badge = el("span", { class: "history-card__goal-badge" }, ["🏆 Goal!"]);
    card.appendChild(badge);
  }

  // Details block
  const details = el("div", { class: "history-card__details" });

  // Swing summary row
  const swingRow = el("div", { class: "history-card__row" });
  swingRow.appendChild(el("span", {}, ["🔄 Swings: "]));
  swingRow.appendChild(el("span", { class: "history-card__time" }, [weightSummary(session.swings)]));

  if (session.swingBlockSec !== undefined) {
    const met = session.swingBlockSec <= goal.swingStandardSec;
    swingRow.appendChild(
      el("span", {}, [" · "]),
    );
    swingRow.appendChild(
      el("span", {
        class: `history-card__time ${met ? "history-card__time--met" : "history-card__time--over"}`,
      }, [
        `${formatSec(session.swingBlockSec)} / ${formatSec(goal.swingStandardSec)}`,
        met ? " ✓" : " ✗",
      ]),
    );
  }

  details.appendChild(swingRow);

  // Getup summary row
  const getupRow = el("div", { class: "history-card__row" });
  getupRow.appendChild(el("span", {}, ["🎯 Get-ups: "]));
  getupRow.appendChild(el("span", { class: "history-card__time" }, [weightSummary(session.getups)]));

  if (session.getupBlockSec !== undefined) {
    const met = session.getupBlockSec <= goal.getupStandardSec;
    getupRow.appendChild(el("span", {}, [" · "]));
    getupRow.appendChild(
      el("span", {
        class: `history-card__time ${met ? "history-card__time--met" : "history-card__time--over"}`,
      }, [
        `${formatSec(session.getupBlockSec)} / ${formatSec(goal.getupStandardSec)}`,
        met ? " ✓" : " ✗",
      ]),
    );
  }

  details.appendChild(getupRow);

  card.appendChild(details);
  return card;
}

/** Pretty-print an ISO date string (YYYY-MM-DD) to locale-aware format. */
function formatDate(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── Main render function ─────────────────────────────────────────────────────

/** Mount the history view into `container`. Returns a no-op cleanup (stateless view). */
export function renderHistory(container: HTMLElement, store: Store): () => void {
  const { sessions, settings } = store.getState();
  const { goal } = settings;

  const root = el("div", { class: "history-view" });
  const title = el("h2", { class: "section-title" }, ["Session history"]);
  root.appendChild(title);

  if (sessions.length === 0) {
    const empty = el("p", { class: "history-empty" }, [
      "No sessions logged yet. Complete your first session to see it here.",
    ]);
    root.appendChild(empty);
  } else {
    const list = el("div", { class: "history-list" });
    // sessions is already newest-first (addSession prepends)
    for (const session of sessions) {
      list.appendChild(buildCard(session, goal));
    }
    root.appendChild(list);
  }

  clear(container).appendChild(root);
  return () => { /* stateless — nothing to clean up */ };
}
