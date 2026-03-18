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

## Deferred / Future

- **STAB-05**: Expand smoke automation beyond the initial checklist/small-script seam once runtime hardening is stable
- **STAB-06**: Add deeper packaged-build smoke coverage if Windows installer issues become a repeating source of regressions
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

**Coverage:**
- v1.3 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after completing v1.3 / Phase 1*
