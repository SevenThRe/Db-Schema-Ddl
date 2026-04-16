# Plan: Grid Edit Dirty-State UX

## Summary

This wave closes the main UX gap in the existing grid-edit flow by projecting pending patches back into the result grid and selected-row inspector. The backend prepare/commit path already exists, so the work stays in the React layer and preserves the current Tauri contract.

## Scope

- Create a dedicated 006 harness wave for result-grid edit UX.
- Pass pending edit patches from `WorkbenchLayout` into `ResultGridPane`.
- Overlay staged values onto rendered cells, filtering, and selected-row inspection.
- Highlight dirty rows and cells with compact workbench-safe styling.
- Preserve original `beforeValue` when the same cell is edited repeatedly before commit.

## Likely Touchpoints

- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`

## Risks

- The grid uses virtualized rendering, so dirty-state computation must stay lightweight and deterministic.
- Selected-row state is tracked by filtered index, so overlay logic must not desynchronize row selection after edits.
- Multi-edit semantics must preserve the original database value even when the UI already displays a staged value.

## Verification

- `npm run check`
- `cargo check` to confirm no frontend-only change accidentally broke desktop wiring
- Manual desktop verification later: edit cell -> observe highlight/value overlay -> prepare commit -> discard edits
