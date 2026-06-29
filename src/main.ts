/**
 * App bootstrap.
 *
 * NOTE: temporary Phase 0 stub. Phase 2 replaces this with the real wiring:
 *   load persisted state -> state container -> render -> events,
 *   re-render on change, persist on change, register the service worker.
 */
import type { ExerciseKind } from "./domain/types";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  const kinds: ExerciseKind[] = ["swing", "getup"];
  app.textContent = `Kettlebells — scaffold ready (${kinds.join(", ")}).`;
}
