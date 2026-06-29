# ADR-0001: Vanilla TypeScript, no UI framework

- Status: Accepted
- Date: 2026-06-29

## Context

Kettlebells is a small, local-only progress tracker for the Simple & Sinister 2.0 program.
The UI surface is modest (log sessions, set per-set weights, view history). The maintainer
wants the project to stay "as vanilla as possible" and easy to reason about, while still being
agent-friendly for development.

## Decision

Build the app in **TypeScript with no UI framework**. Use plain DOM APIs organized into small
render-function modules, a single app-state object, and a tiny pub/sub for re-render. Use
**strict** TypeScript as the primary correctness guardrail.

## Consequences

- No React/Vue/Svelte/etc., and no virtual-DOM or signals libraries. UI complexity is managed by
  splitting render functions, not by adding dependencies.
- Smallest possible footprint; nothing to keep up to date but the toolchain.
- Agents must resist the default reflex to scaffold a framework app. CLAUDE.md states this
  explicitly.
- Strict types catch a large share of agent mistakes at compile time.
