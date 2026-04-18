---
phase: 43-define-extension-shell-and-contribution-model-for-activity-bar-sidebar-views-and-workbench-surfaces
plan: 02
subsystem: extension-platform-frontend-host
tags: [extensions, react, routing, resolver, test]
requires:
  - phase: 43-01
    provides: Canonical manifest contract for activity, sidebar, and workbench shell contributions
provides:
  - Normalized frontend resolver outputs for activity bar items, sidebar views, and workbench views
  - Extension route identity that can carry activity and workbench targets beyond legacy panel ids
  - Regression coverage for the new contribution model and migration bridge
affects: [phase-44-shell-host, extension-routing, compatibility-tests]
tech-stack:
  added: []
  patterns: [normalized shell resolvers, workbench-view-first mounting, migration guard tests]
key-files:
  created:
    - test/client/extension-contribution-model-phase43.test.ts
  modified:
    - client/src/extensions/contribution-resolver.ts
    - client/src/extensions/host-context.tsx
    - client/src/extensions/host-api.ts
    - client/src/extensions/ExtensionWorkspaceHost.tsx
key-decisions:
  - "Normalized canonical and legacy manifest data into separate activity/sidebar/workbench collections instead of keeping nav-to-panel inference."
  - "Kept panelId as a compatibility route while making workbenchViewId the preferred host mounting target."
patterns-established:
  - "Frontend host state exposes canonical shell collections alongside temporary compatibility outputs."
  - "Legacy manifests normalize into canonical shell defaults instead of forcing workspacePanels[0] inference."
requirements-completed: []
duration: 9min
completed: 2026-04-17T10:47:13+08:00
---

# Phase 43 Plan 02 Summary

The frontend host now resolves extension shell identity as activity items, sidebar views, and workbench views instead of collapsing everything into one nav item plus one panel.

## Accomplishments

- Added `resolveActivityBarItems`, `resolveSidebarViews`, and `resolveWorkbenchViews` in [client/src/extensions/contribution-resolver.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/contribution-resolver.ts), including compatibility mapping from legacy contribution fields.
- Extended [client/src/extensions/host-context.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/host-context.tsx) so the host exposes canonical shell collections in addition to temporary compatibility outputs.
- Updated [client/src/extensions/host-api.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/host-api.ts) and [client/src/extensions/ExtensionWorkspaceHost.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionWorkspaceHost.tsx) so extension routing can target `activityItemId` and `workbenchViewId`, while still tolerating legacy `panelId`.
- Added [test/client/extension-contribution-model-phase43.test.ts](/E:/work/Db-Schema-Ddl/test/client/extension-contribution-model-phase43.test.ts) to lock the canonical field names and compatibility bridge in place.

## Verification

- npm run check: passed
- NODE_OPTIONS=--import=tsx node --test --experimental-strip-types test/client/extension-contribution-model-phase43.test.ts: passed
- cargo check --manifest-path src-tauri/Cargo.toml -j 1: passed

## Notes

- `ExtensionWorkspaceHost` now prefers `workbenchViewId` and only falls back to `panelId` for migration safety.
- No atomic commit was created because the workspace already contained unrelated in-flight changes.

## Self-Check: PASS
