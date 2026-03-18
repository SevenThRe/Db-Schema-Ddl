# Desktop Stability and Real-Env Smoke

## What This Is

This milestone follows the delivered `v1.2` schema-provenance workflow and intentionally shifts away from feature breadth. The goal is to make the desktop runtime trustworthy in real use: startup, shutdown, native modules, extension delivery, SQLite compatibility, and one real DB-management smoke path should behave predictably before the next feature-expansion milestone begins.

The target audience is the same existing DBSchemaExcel2DDL desktop user base, but the milestone is operational rather than product-breadth oriented.

## Core Value

Users can trust that the desktop app:

- starts reliably
- shuts down cleanly
- records actionable local diagnostics when something goes wrong
- handles extension/download/runtime failures with understandable product messaging
- survives a repeatable real-environment smoke pass

without regressing the feature surface shipped in `v1.0` through `v1.2`.

## Requirements

### Validated

- Existing users can upload Excel definition files and parse multiple table definitions from a workbook
- Existing users can generate MySQL and Oracle DDL from structured table definitions
- Existing users can install the official DB management extension, compare file vs DB, preview SQL, run safe apply, inspect history, visualize schema graphs, export live DB schema to workbook templates, and reverse-import supported DDL/bundles

### Active

- [ ] **STAB-01**: Electron startup and shutdown paths are hardened so fatal-path failures do not leak raw JS error spam to users
- [ ] **STAB-02**: Desktop runtime failures write reliable persistent local diagnostics, including startup, shutdown, extension delivery, and migration issues
- [ ] **STAB-03**: Native-module, migration-compatibility, and extension-catalog seams have targeted preflight/release guards
- [ ] **STAB-04**: A repeatable real-environment smoke path exists for startup, shutdown, SQLite init/migration, extension entry flow, and one real MySQL DB-management path

### Out of Scope

- New compare/export/import feature breadth
- General-purpose Electron E2E infrastructure
- Cross-environment DB sync/apply
- Full CI expansion beyond targeted desktop/runtime guards

## Context

- `v1.0` is complete and audited at `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `v1.1` is complete and audited at `.planning/v1.1-v1.1-MILESTONE-AUDIT.md`
- `v1.2` is complete and audited at `.planning/v1.2-v1.2-MILESTONE-AUDIT.md`
- Recent real-world failures were concentrated in Electron/native-module/migration/extension seams rather than feature gaps
- The next value jump is operational confidence, not feature expansion

## Constraints

- **Compatibility**: `v1.0` through `v1.2` user-facing flows must remain intact
- **Windows-first**: native-module and packaging assumptions can stay Windows-first for this milestone
- **Diagnostics**: user-visible errors should be calm and translated; technical detail should move into local logs
- **Scope discipline**: this milestone should not drift into unrelated feature work
- **AI/MCP-readiness**: smoke and diagnostic artifacts should remain structured enough for future automation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Start `v1.3` with runtime hardening | Recent regressions came from startup/shutdown/runtime seams | Accepted |
| Prefer simple persistent logging over a new logging stack | Reliability and low complexity matter more than framework breadth | Accepted |
| Use targeted release guards instead of broad CI expansion | Known desktop seams are narrow and already identifiable | Accepted |
| Start smoke evidence with a checklist plus small scripts | Best value before building heavy Electron automation | Accepted |

---
*Last updated: 2026-03-18 when opening v1.3*
