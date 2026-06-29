/**
 * Service worker registration.
 *
 * Only runs in production (when `import.meta.env.PROD` is true) and only
 * when the browser supports service workers. Safe to call unconditionally from
 * main.ts — it self-guards.
 */

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).then(
      (registration) => {
        // Log successful registration in dev builds only (PROD guard above
        // means this branch only runs in PROD, but keep as a hook for future use)
        void registration;
      },
      (err) => {
        // SW registration failed — app still works, just not offline-capable
        console.warn("Service worker registration failed:", err);
      },
    );
  });
}
