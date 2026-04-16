# Plan: Unified DB Workbench Entry UX

## Summary

This wave changes the information architecture of `DbConnectorWorkspace.tsx` without changing backend capability wiring. The goal is to stop exposing historical implementation splits as product-level tabs.

## Scope

- Keep the existing `workspaceView` state and route persistence.
- Replace the first-level segmented tab bar with a workbench-first header action model.
- Keep `Tabs`/`TabsContent` structure for low-risk rendering continuity.
- Reframe `schema` and `diff` as explicit legacy secondary actions.
- Refresh empty-state and section copy from `SQL 工作台` language toward unified `Database workspace` language.

## Likely Touchpoints

- `client/src/components/extensions/DbConnectorWorkspace.tsx`

## Risks

- The shell still needs to preserve legacy regression coverage, so this wave must not delete the old content branches.
- Connection-center editing mode currently piggybacks on the `connections` view, so the new header logic must keep that route intact.
- Route persistence should remain compatible with existing `sql` query/localStorage values.

## Verification

- `npm run check`
- `cargo check`
- Manual check in desktop app: active connection opens unified workspace path; schema/diff remain reachable as legacy actions
