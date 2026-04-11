# Requirements: Release-Grade DB Workbench v1.8

**Created:** 2026-04-11
**Milestone:** v1.8 Release-Grade DB Workbench
**Status:** Active

## Milestone Goal

Turn DB Workbench from a capable prototype into a publishable daily-use desktop product by closing release blockers in credential safety, runtime semantics, workflow coherence, inspection depth, and release validation.

---

## Requirements

### Category: Credential & Runtime Safety (SAFE)

- [ ] **SAFE-01**: User credentials are stored using OS-backed secure storage or an equivalently protected local mechanism instead of plaintext app settings.
- [ ] **SAFE-02**: Existing saved connections have a safe migration path so upgrades do not silently lose access or keep plaintext secrets without explicit operator knowledge.
- [ ] **SAFE-03**: Read-only connections block all mutating statements and side-effecting runtime paths, including export/apply re-execution paths, in Rust command handlers.
- [ ] **SAFE-04**: Dangerous or destructive actions require consistent confirmation behavior and explicit operator-visible outcome messages across execute, export, edit, and sync flows.
- [ ] **SAFE-05**: Workbench UI labels and runtime behavior stay semantically aligned so "current page", "loaded rows", stop-on-error, cancel, and similar controls never promise behavior different from what actually runs.

### Category: Canonical Product Workflow (FLOW)

- [ ] **FLOW-01**: User reaches all primary DB tasks through one canonical workbench workflow, not split between modern and legacy surfaces.
- [ ] **FLOW-02**: User can manage connection context, active schema, environment cues, and read-only cues from one coherent workbench surface without ambiguous state loss.
- [ ] **FLOW-03**: User can switch among editor, results, explain, sync, and connection views without misleading resets or hidden state changes.
- [ ] **FLOW-04**: User can reopen the app and recover the last active connection/workspace state with clear recovery behavior when the connection is unavailable.

### Category: Deep Inspection Coverage (INSP)

- [ ] **INSP-01**: User can inspect tables, views, indexes, and foreign keys from the explorer in a way that scales beyond toy schemas.
- [ ] **INSP-02**: User can inspect supported routines, triggers, functions, or procedures when the active driver exposes them.
- [ ] **INSP-03**: User can open a definition or DDL preview for supported objects directly from the explorer.

### Category: Release Validation & Ship Gate (QUAL)

- [ ] **QUAL-01**: Maintainer has reproducible live-database verification coverage for MySQL and PostgreSQL across connect, query, paging, export, cancel, edit, readonly, and object-inspection flows.
- [ ] **QUAL-02**: Packaged desktop builds have smoke-test evidence that covers startup, saved-connection recovery, and critical DB Workbench workflows.
- [ ] **QUAL-03**: The project has an explicit ship gate that classifies release blockers versus deferrable issues before a public publish decision.

---

## Future Requirements

| Feature | Reason Deferred |
|---------|-----------------|
| Connection-scoped script/snippet library | Useful, but not a publishability blocker while credential security and workflow coherence are unfinished |
| Favorites / quick launch | Increases convenience, but should follow the canonical product workflow cleanup |
| Browse presets and richer repeat-data shortcuts | Valuable after the workbench is secure, coherent, and inspection-complete |

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Broad DB engine expansion beyond MySQL/PostgreSQL | Publishability on the current supported engines has higher leverage |
| Visual ER authoring / drag-to-design modeling | Product trust and operational depth are the current blocker |
| Team collaboration / shared libraries / cloud sync | Keep this milestone local-first and release-focused |
| Non-blocking cosmetic redesign work | Product-grade safety and workflow correctness come before polish passes |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SAFE-01 | Phase 23 | Complete |
| SAFE-02 | Phase 23 | Complete |
| SAFE-03 | Phase 23 | Complete |
| SAFE-04 | Phase 23 | Complete |
| SAFE-05 | Phase 23 | Complete |
| FLOW-01 | Phase 24 | Pending |
| FLOW-02 | Phase 24 | Pending |
| FLOW-03 | Phase 24 | Pending |
| FLOW-04 | Phase 24 | Pending |
| INSP-01 | Phase 25 | Pending |
| INSP-02 | Phase 25 | Pending |
| INSP-03 | Phase 25 | Pending |
| QUAL-01 | Phase 26 | Pending |
| QUAL-02 | Phase 26 | Pending |
| QUAL-03 | Phase 26 | Pending |

**Coverage: 15/15 requirements mapped (100%)**

---

*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after completing Phase 23 Release Safety Foundations*
