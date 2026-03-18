---
phase: 02-template-and-round-trip-authoring-v1_1
slug: template-and-round-trip-authoring-v1_1
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-18
updated: 2026-03-18
---

# Phase 2 - Validation Strategy

> Per-phase validation contract for first-party workbook templates, template-led creation, and parser-backed round-trip trust.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Focused commands** | `node --test --import tsx test/server/template-phase2.test.ts`, `node --test --import tsx test/client/template-phase2-ui.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task batch:** Run `npm run check`
- **After contract/backend wave:** Run focused server tests
- **After sidebar/chooser wave:** Run focused client tests
- **Before phase close:** Run `npm test`

---

## Validation Architecture

Phase 2 needs validation in four layers:

1. **Template contract validation**
   - exactly two first-party template variants exist and are typed explicitly
   - the create flow returns both workbook metadata and round-trip trust status
2. **Workbook generation validation**
   - built-in templates are created from parser-proven layout skeletons rather than ad hoc shapes
   - generated workbooks are real `.xlsx` files, not transient drafts
3. **Round-trip validation**
   - every built-in template is reopened through the existing parser immediately after creation
   - built-in template validation failure blocks the file from being presented as trusted
4. **UI workflow validation**
   - the sidebar upload affordance becomes an action menu
   - `从模板创建` opens a chooser rather than exposing multiple top-level upload buttons
   - a successful create flow registers the workbook into the normal file list and selects it

---

## Wave 0 Test Targets

| Area | Expected coverage |
|------|-------------------|
| Shared contracts | Two template variants, create request/response, and round-trip report are typed |
| Backend generation | Template creation yields a parser-compatible workbook and blocks on validation mismatch |
| File lifecycle | Successful creation registers a real workbook through the normal file inventory path |
| UI shell | Upload action menu, chooser dialog, and post-create activation flow work coherently |

---

## Exit Conditions

- [ ] `npm run check`
- [ ] Focused server template tests green
- [ ] Focused client template workflow tests green
- [ ] `npm test`
- [ ] Built-in template validation failures block success state

