---
phase: 4
slug: ddl-import-and-extension-management-v1_4
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (via vite.config.ts test section) |
| **Config file** | vite.config.ts |
| **Quick run command** | `npm run check` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds (check) / ~90 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `npm run check` (TypeScript type checking)
- **After every wave merge:** Run `npm run build` (full compile validates all types + Rust + bundling)
- **Phase gate:** Full build green + human visual verification of all 5 success criteria

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| IMP-01 | DDL import workspace activates from sidebar nav; user sees statement list | visual/smoke | `npm run check` (type safety) | Manual visual required |
| IMP-02 | DangerousSqlDialog fires for DROP/TRUNCATE/ALTER in DDL import; prod requires DB name typing | integration | `npm run check` | Manual test with live DB |
| IMP-03 | Per-statement execution loop: previewDangerousSql → DangerousSqlDialog → executeQuery(confirmed) | integration | `npm run build` | Manual test with SQL file containing DROP |
| EXTUI-01 | Primary sidebar has no extension-type entries (数据库, DDL→Excel, Enum生成 absent) | visual/smoke | `npm run check` | Manual visual check |
| EXTUI-02 | 扩展功能 nav entry routes to full-page Extension Management view | visual/smoke | `npm run check` | Manual visual check |
| EXTUI-03 | Extension Management lists cards with name, description, version, enabled toggle, Open/Launch button | visual/smoke | `npm run build` | Manual visual check |
| EXTUI-04 | DB 工作台 appears in Extension Management as enabled by default | unit/integration | `npm run check` (type contract) | Verify ext_list_all returns enabled:true |
| EXTUI-05 | Toggling DB 工作台 off hides workbench entry from all nav surfaces (sidebar + toolbar) | integration | `npm run build` | Manual: toggle off, restart app, verify absent |

---

## Wave 0 Gaps

**No Wave 0 infrastructure gaps.** Phase 4 uses only existing test infrastructure:
- `npm run check` — TypeScript type checking (vitest + tsc)
- `npm run build` — Full build (Vite frontend + esbuild server + Rust Tauri binary)

Human visual verification is required for all 5 success criteria (no automated E2E framework in project).

---

## Critical Verification Checkpoints

### After Wave 1 (Rust cleanup + sidebar nav wiring):
- Run `npm run build` — must pass
- Visual: Sidebar shows ONLY built-in nav items (DDL 生成器, DDL 导入, Schema Diff) plus DB 工作台 if enabled
- Visual: 数据库/DDL→Excel/Enum生成 are NOT visible in sidebar
- Visual: DB 工作台 nav entry appears (from extNavItems, NOT hardcoded)

### After Wave 2 (Extension Management page):
- Run `npm run build` — must pass
- Visual: Clicking 扩展功能 opens full-page Extension Management (not a dialog)
- Visual: DB 工作台 card shows correct data (name, version, description, enabled toggle)
- Functional: Toggle off → sidebar DB 工作台 entry disappears (within same session, no 60s wait)
- Functional: Toggle on → sidebar DB 工作台 entry reappears

### After Wave 3 (DDL import live execution):
- Run `npm run build` — must pass
- Visual: DDL 导入 sidebar entry navigates to the workspace
- Functional: Upload a .sql file → statement list renders
- Functional: Execute with no dangerous SQL → per-statement success shown
- Functional: Execute with DROP TABLE → DangerousSqlDialog appears before execution
- Functional: Prod connection → typing DB name required before DDL import proceeds

### Phase Gate (all waves complete):
- `npm run build` exits 0
- All 5 success criteria manually verified
- App restart test: disabled DB 工作台 stays hidden after restart
