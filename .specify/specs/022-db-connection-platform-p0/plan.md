# Plan: DB Connection Platform P0

## Summary

This wave converts the productized connection-platform contract into concrete P0 product behavior and messaging. It should build on the existing connection governance work rather than redoing it.

## Likely Touchpoints

- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- `client/src/extensions/host-api.ts`
- `shared/schema.ts`
- related docs and tests

## Risks

- Connection help text can accidentally overpromise future transport support.
- Safety messaging can become repetitive if it is not placed carefully.

## Verification

- `npm run check`
- `cargo check`
- targeted client tests for connection-surface copy and governance visibility
- manual desktop verification of environment and readonly context in the workbench shell
