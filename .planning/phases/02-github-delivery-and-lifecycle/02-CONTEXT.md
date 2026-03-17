# Phase 2: GitHub Delivery and Lifecycle - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the official GitHub-backed extension distribution and lifecycle flow for the DB management module. It covers catalog metadata, download, verification, install, enable/disable, update, and uninstall behavior inside the host app, but does not include DB connectivity, schema comparison, or deploy functionality from the extension itself.

</domain>

<decisions>
## Implementation Decisions

### Pre-download detail surface
- The uninstalled `DB 管理` flow should open a small detail panel, not a bare confirmation modal.
- The panel should show at least: extension version, package size, compatibility, and update summary.
- The panel remains a lightweight decision surface, not a full marketplace-style page.

### Download and install flow
- After the user starts download, the same detail panel should transition into a progress view.
- Progress should cover the full lifecycle inside one surface: download, verify, and install.
- Phase 2 should not switch to a separate floating progress card for the extension flow.

### Management entry points
- `DB 管理` in the sidebar continues to be the primary module entry and current-status entry point.
- A dedicated `扩展管理` area should be added in Settings for full lifecycle controls.
- Enable, disable, uninstall, and update controls should live in Settings, while the sidebar entry remains the everyday access point.

### Failure and recovery messaging
- Failure states must distinguish between at least: network failure, checksum/verification failure, app-extension incompatibility, and install failure.
- Each failure state should explain the next action clearly instead of only showing a generic retry button.
- v1 does not need a raw log or technical-detail drawer for end users.

### Update checks
- The host should check for extension updates when the user enters `DB 管理` or `扩展管理`.
- The host should not proactively surface extension update prompts elsewhere in the app for v1.
- Manual interaction with extension surfaces is the trigger for freshness checks.

### Claude's Discretion
- Exact panel layout and copy hierarchy, as long as it stays compact and readable
- Exact wording for compatibility and error messages
- Exact Settings-page information architecture for `扩展管理`
- Exact visual treatment of lifecycle stages inside the install panel

</decisions>

<specifics>
## Specific Ideas

- The user wants the extension flow to feel integrated and self-contained rather than bouncing between multiple UI surfaces.
- The desired install UX is “open details, decide, watch progress in place.”
- Extension management should feel like a normal part of app administration, which is why full controls belong in Settings.
- The user prefers operational clarity over technical verbosity: tell them what failed and what to do next, but don’t expose raw logs in v1.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `electron/updater.ts`: already implements a GitHub-based update pattern with manual download start and progress events that can inform extension delivery design.
- `client/src/components/UpdateNotifier.tsx`: provides a reference for staged lifecycle messaging and progress display behavior.
- `electron/extensions.ts`: already owns extension install roots and activation behavior; Phase 2 can extend this service rather than inventing a second lifecycle path.
- `client/src/components/extensions/ExtensionInstallDialog.tsx`: current lightweight install dialog is the natural place to evolve into the Phase 2 detail/progress panel.
- `client/src/components/extensions/ExtensionStatusDialog.tsx`: already covers disabled and incompatible recovery prompts and can be expanded with update-oriented actions.

### Established Patterns
- The host currently treats extension lifecycle as a dedicated Electron concern, separate from app updates.
- Renderer access to privileged extension actions already goes through narrow preload APIs and typed server hooks.
- Extension state in the UI is driven by typed host status, not by direct file-system inspection in the client.

### Integration Points
- Catalog fetch and install commands should extend the existing extension route group and extension React hooks.
- Download/verify/install orchestration should extend `electron/extensions.ts` and its preload bridge rather than piggybacking on updater IPC.
- Settings should gain an `扩展管理` section that reads the same extension state source as the sidebar entry.

</code_context>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 02-github-delivery-and-lifecycle*
*Context gathered: 2026-03-17*
