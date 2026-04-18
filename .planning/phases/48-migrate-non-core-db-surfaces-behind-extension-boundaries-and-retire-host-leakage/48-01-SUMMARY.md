---
phase: 48-migrate-non-core-db-surfaces-behind-extension-boundaries-and-retire-host-leakage
plan: 01
subsystem: host-route-contract-cleanup
tags: [extensions, host-shell, routing, cleanup]
completed: 2026-04-18T19:35:00+08:00
---

# Phase 48 Plan 01 Summary

Phase 48 begins by removing `panelId` leakage from the host route contract and aligning the host with the canonical workbench-view model.

## Accomplishments

- Removed `panelId` from [host-api.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/host-api.ts), [Dashboard.tsx](/E:/work/Db-Schema-Ddl/client/src/pages/Dashboard.tsx), [ExtensionWorkspaceHost.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionWorkspaceHost.tsx), [panel-registry.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/panel-registry.ts), and the management-page route builder.
- Simplified `ExtensionWorkspaceHost` so it resolves builtin workbench components through normalized workbench-view ids instead of host-owned `panelId` fallback state.
- Renamed the user-facing missing-target copy from panel wording to surface/workbench wording.

## Verification

- `npm run check`

## Self-Check

PASS
