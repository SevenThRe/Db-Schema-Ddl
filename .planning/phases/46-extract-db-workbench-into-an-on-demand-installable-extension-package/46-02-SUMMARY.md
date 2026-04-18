---
phase: 46-extract-db-workbench-into-an-on-demand-installable-extension-package
plan: 02
subsystem: extension-runtime-bridge
tags: [extensions, runtime-ui, iframe, host-api, db-workbench]
requires:
  - phase: 46
    plan: 01
    provides: UI-only external manifest and install contract
provides:
  - Runtime host-context injection path
  - Host/runtime RPC bridge for iframe-mounted extensions
  - Extracted db-connector runtime entry for workbench and sidebar surfaces
affects: [phase-46-runtime-extraction, phase-48-host-leakage-cleanup]
tech-stack:
  added: []
  patterns: [postMessage rpc, static host provider, sandbox-safe storage]
key-files:
  created:
    - client/src/extensions/runtime/protocol.ts
    - client/src/extensions/runtime/host-dispatch.ts
    - client/src/extensions/runtime/runtime-bridge.ts
    - client/src/extensions/runtime/db-connector-extension-app.tsx
    - client/src/extensions/runtime/db-connector-main.tsx
    - client/db-connector-extension.html
  modified:
    - client/src/extensions/host-context.tsx
    - client/src/extensions/ExtensionRuntimeFrame.tsx
    - client/src/extensions/shell/ExtensionSecondarySidebar.tsx
    - client/src/components/extensions/DbConnectorWorkspace.tsx
    - client/src/components/extensions/db-workbench/sidebar/db-connector-sidebar-events.ts
    - client/src/components/theme-provider.tsx
key-decisions:
  - "Iframe-mounted extension UI now reaches host DB APIs through a narrow postMessage bridge instead of direct desktopBridge imports."
  - "The extracted db-connector bundle reuses existing workbench/sidebar React surfaces by injecting a static host context."
patterns-established:
  - "Sandboxed extension runtimes now guard storage access so opaque-origin iframe mounts do not crash while still staying isolated."
requirements-completed: []
duration: 26min
completed: 2026-04-18T17:53:02+08:00
---

# Phase 46 Plan 02 Summary

The DB workbench no longer depends on host-local panel registration to be interactive. Phase 46 now has a real runtime bridge plus an extracted frontend entrypoint that can run inside the installable extension iframe.

## Accomplishments

- Refactored [host-context.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/host-context.tsx) to support injected extension state and scoped HostApi instances for extracted runtime bundles.
- Added a runtime message protocol and dispatch path in [protocol.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/runtime/protocol.ts), [host-dispatch.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/runtime/host-dispatch.ts), [runtime-bridge.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/runtime/runtime-bridge.ts), and [ExtensionRuntimeFrame.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionRuntimeFrame.tsx).
- Added the extracted db-connector runtime entry in [db-connector-extension-app.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/runtime/db-connector-extension-app.tsx), [db-connector-main.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/runtime/db-connector-main.tsx), and [client/db-connector-extension.html](/E:/work/Db-Schema-Ddl/client/db-connector-extension.html), reusing the existing workbench and sidebar views.
- Hardened [DbConnectorWorkspace.tsx](/E:/work/Db-Schema-Ddl/client/src/components/extensions/DbConnectorWorkspace.tsx), [db-connector-sidebar-events.ts](/E:/work/Db-Schema-Ddl/client/src/components/extensions/db-workbench/sidebar/db-connector-sidebar-events.ts), and [theme-provider.tsx](/E:/work/Db-Schema-Ddl/client/src/components/theme-provider.tsx) against sandboxed iframe storage failures.

## Verification

- npm run check: passed

## Self-Check: PASS
