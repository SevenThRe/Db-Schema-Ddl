# Phase 1: Extension Host Foundation - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the host-side foundation for optional extensions inside the existing desktop application. It covers how the DB management extension is represented, discovered, installed, enabled, and status-indicated in the base app, but does not include DB connectivity, schema diff against live DBs, or deployment execution.

</domain>

<decisions>
## Implementation Decisions

### Entry placement
- The `DB 管理` entry should always be visible in the left sidebar.
- It should be treated as a module-level entry, not as a worksheet-related view mode like `Preview` or `Diff`.
- The extension entry should remain present regardless of installation state so users always know the capability exists.

### Uninstalled state
- When the extension is not installed, the sidebar entry should appear greyed out.
- The entry should include a small download/extension marker so it reads as "available to install" rather than simply "disabled."
- Clicking the greyed-out entry should open a concise confirmation modal prompting the user to download the extension.

### Install prompt and activation
- The first interaction should be a simple confirmation modal, not a detailed information panel.
- After installation completes, the app should offer `立即启用`.
- The implementation can use an app restart or reload behind that action; user-facing behavior should feel like a direct enable step rather than a manual restart flow.

### Trust and extension status
- The DB management capability should be presented as an `官方扩展`.
- v1 should only allow downloading and enabling the official extension from the author's GitHub release source.
- If the extension is installed but disabled, keep the sidebar entry visible with an `已禁用` style/marker and allow the user to re-enable it from a lightweight status prompt.
- If the extension is installed but incompatible, show the sidebar entry in a disabled/grey state with a `需要更新` marker and prompt the user to update either the app or the extension.

### Claude's Discretion
- Exact badge/icon wording for the sidebar marker
- Exact modal copy, as long as it stays concise
- Whether `立即启用` performs a full app relaunch or a controlled in-app reload
- Exact visual treatment for disabled versus incompatible states, as long as the status remains obvious

</decisions>

<specifics>
## Specific Ideas

- The user wants the feature to remain visible in the main UI rather than hidden until needed.
- The user explicitly sees DB management as a separate module, not "another worksheet-related mode."
- The desired uninstalled experience is "grey but installable," not "invisible" and not "secretly available."
- The preferred trust model is explicit first-party branding: this should read as an official extension, not a generic plugin.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/pages/Dashboard.tsx`: already owns the left sidebar and the main workspace mode switching; this is the natural place to expose a persistent `DB 管理` entry.
- `electron/updater.ts`: already implements a confirmation-oriented GitHub download/update interaction model that can inform extension download UX.
- `electron/main.ts`: already controls desktop lifecycle and can support restart/reload behavior after installation.

### Established Patterns
- The app already separates module-level concerns between sidebar/file selection and center-panel views rather than treating every capability as the same kind of workspace tab.
- Desktop runtime behavior is centralized through Electron bootstrap plus a bundled local Express server, which favors restart/reload-based extension activation over hot-loading in v1.
- Shared route/schema patterns suggest the extension host should expose explicit typed status and lifecycle APIs rather than ad hoc runtime flags.

### Integration Points
- Sidebar state and entry rendering should integrate into the existing dashboard shell.
- Extension lifecycle state should likely live in shared schema/storage so both Electron and the app UI can read it.
- Activation and restart hooks should integrate with the Electron process layer rather than being handled entirely in the React client.

</code_context>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 01-extension-host-foundation*
*Context gathered: 2026-03-17*
