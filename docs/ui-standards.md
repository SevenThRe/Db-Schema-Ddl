# UI Standards (Codex-inspired)

This document defines layout and interaction rules to keep the app readable, stable, and consistent across wide and narrow screens.

## 1) Layout principles

- Content first: primary content should remain readable at all widths.
- Predictable resizing: panel drag, window resize, and zoom must not cause control overlap.
- One scroll owner: each major area should have only one primary scroll container.
- Progressive disclosure: secondary actions (delete, advanced actions) can stay subtle but must stay discoverable.

## 2) Panel and width rules

- Avoid hard fixed widths inside resizable panels unless absolutely required.
- Prefer responsive sizing:
  - `min-w-*` to avoid collapse,
  - `max-w-*` to avoid overflow,
  - `w-full` inside panel content.
- Default horizontal layout:
  - Sidebar + 3-panel main layout on wide screens.
  - Auto switch to 2-panel main layout below compact breakpoint.
- Compact breakpoint: `window.innerWidth < 1500`.
- In compact layout, collapse Sheet selector into a drawer.

## 3) Toolbar rules

- Toolbars must allow wrapping (`flex-wrap`) under narrow widths.
- Preserve action priority:
  1. View mode / context actions
  2. Search / navigation
  3. Secondary status badges
- Do not place essential controls in absolute overlays over content.

## 4) Action affordance and safety

- Destructive actions require confirmation dialog.
- Action slots should reserve stable horizontal space to avoid layout jump.
- Hover states can change opacity/color, but should not change element size or reflow surrounding controls.

## 5) Visual hierarchy

- Use spacing scale consistently: 8 / 12 / 16 / 24.
- Reduce heavy borders; use subtle separators and background layers.
- Keep status colors semantic:
  - error: destructive/red
  - warning: amber
  - success: green
  - neutral: muted

## 6) Keyboard and accessibility

- Maintain keyboard path for major actions (search, select, generate, export).
- Add `aria-label` for icon-only controls.
- Preserve focus visibility for all interactive elements.

## 7) Validation checklist (must pass before merge)

- Resize test: 1920 / 1366 / 1024 widths.
- Panel drag test: no overlap or clipped controls in all panels.
- Long text test: long file names and table names do not break layout.
- i18n test: Chinese/Japanese labels do not overlap controls.
- Interaction test: delete confirmation works and prevents accidental delete.
