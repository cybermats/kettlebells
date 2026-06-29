# ADR-0005: Open Props for styling

- Status: Accepted
- Date: 2026-06-29

## Context

We want consistent, good-looking UI without adopting a CSS framework or CSS-in-JS, staying in
the "vanilla" spirit. Hand-rolled CSS risks inconsistent spacing/color values, especially when
multiple agents touch it.

## Decision

Write **plain CSS** and use **[Open Props](https://open-props.style/)** design tokens (CSS custom
properties) for spacing, sizes, colors, radii, shadows, and the like. No Tailwind, no utility-class
framework, no CSS-in-JS.

## Consequences

- One small dependency (importable as a stylesheet, tree-shakeable by token group). Not a
  framework — we still author our own CSS.
- Provides a coherent design scale out of the box, which keeps agent-written styles consistent.
- CSS variables make theming (e.g. a dark mode for gym lighting) straightforward.
- Authors use tokens (`var(--size-3)`) instead of magic numbers where a token exists.
