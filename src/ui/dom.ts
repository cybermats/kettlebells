/**
 * Minimal DOM helpers — cut boilerplate without adding a framework.
 *
 * Rules:
 *  - No hidden state. Every function produces/returns plain DOM nodes.
 *  - No virtual DOM; callers are responsible for attaching nodes.
 *  - Keep this tiny. If something needs more than a handful of lines here,
 *    it belongs in a view module instead.
 */

/**
 * Create an element with optional attributes and children.
 *
 * @param tag      - The HTML tag name.
 * @param attrs    - Key/value pairs set via `element.setAttribute` (use camelCase
 *                   for event listeners — those are NOT handled here; attach them
 *                   after calling el()).
 * @param children - String text content or child nodes; mixed arrays are fine.
 *
 * @example
 *   const btn = el("button", { class: "btn btn--primary", type: "button" }, ["Save"]);
 *   btn.addEventListener("click", handleSave);
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (string | Node)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  for (const child of children) {
    if (typeof child === "string") {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

/**
 * Empty a DOM node by removing all its children.
 * Returns the node so callers can chain: `clear(container).appendChild(newChild)`.
 */
export function clear<T extends Node>(node: T): T {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  return node;
}

/**
 * Format seconds as m:ss (e.g. 305 → "5:05").
 */
export function formatSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format milliseconds as m:ss.t (e.g. 65432 ms → "1:05.4").
 * Used by the live stopwatch display.
 */
export function formatMs(totalMs: number): string {
  const total = Math.floor(totalMs / 100); // tenths of a second
  const tenths = total % 10;
  const totalSec = Math.floor(total / 10);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}.${tenths.toString()}`;
}

/**
 * Show or hide an element using the hidden attribute.
 */
export function setHidden(node: HTMLElement, hidden: boolean): void {
  if (hidden) {
    node.setAttribute("hidden", "");
  } else {
    node.removeAttribute("hidden");
  }
}
