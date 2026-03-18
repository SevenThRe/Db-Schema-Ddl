# Requirements: Desktop Stability and Real-Env Smoke

**Defined:** 2026-03-18
**Core Value:** Users can trust the Electron desktop runtime to start, stop, diagnose failures, and pass a real-environment smoke path before the next feature-expansion milestone begins.

## v1.3 Requirements

### Runtime Hardening

- [x] **STAB-01**: Electron startup and shutdown paths are hardened so fatal-path failures do not leak raw JS error spam to users
- [x] **STAB-02**: Startup, shutdown, extension-delivery, and migration failures write reliable persistent local diagnostics

### Release Guards

- [x] **STAB-03**: Native-module availability, migration compatibility, and extension-catalog fallback behavior have targeted preflight or release-time guards

### Real-Environment Confidence

- [x] **STAB-04**: A repeatable smoke path exists for startup, shutdown, SQLite init/migration, extension entry flow, and at least one real MySQL DB-management path

### Packaged Deliverable Confidence

- [x] **STAB-05**: Packaged Windows builds (`win-unpacked` first, NSIS installer second) have a repeatable smoke path covering startup, SQLite init/migration, extension entry, `DB 管理` access, and clean shutdown
- [x] **STAB-06**: Packaged-build smoke leaves structured review evidence (`Markdown` + task-friendly `JSON`) plus screenshots/log excerpts, and defines explicit release blockers for packaged runtime failures

## Deferred / Future

- **STAB-07**: Expand smoke automation beyond the initial checklist/small-script seam once packaged confidence is stable
- **UX-01**: Broader polish work for desktop UX once operational confidence is restored

## Out of Scope

| Feature | Reason |
|---------|--------|
| New schema compare/export/import breadth | This milestone is intentionally operational |
| Full Electron UI automation lab | Too heavy for the first stabilization milestone |
| Cross-environment DB sync/apply | Still outside the operational-hardening scope |
| General CI/platform expansion | Targeted desktop guards provide better immediate value |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAB-01 | Phase 1 | Complete |
| STAB-02 | Phase 1 | Complete |
| STAB-03 | Phase 1 | Complete |
| STAB-04 | Phase 1 | Complete |
| STAB-05 | Phase 2 | Complete |
| STAB-06 | Phase 2 | Complete |

**Coverage:**
- v1.3 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-19 after executing v1.3 / Phase 2 Plan 05*
