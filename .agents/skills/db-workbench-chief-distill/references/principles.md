# Operator-Grade Review Rubric

Use this rubric to evaluate whether the DB workbench behaves like a serious desktop operator tool.

## 1. Surface Reachability

Pass when:

- the feature is reachable from the main workbench or clearly marked as legacy
- the current connection and schema context are obvious
- users do not need hidden state to activate the flow

Fail when:

- the code exists but no real entry path reaches it
- users must bounce between legacy and new panes to finish one job
- current source/target/scope is ambiguous

## 2. Operator Safety

Pass when:

- readonly is enforced server-side
- dangerous SQL requires explicit confirmation
- source and target roles are unambiguous
- prod actions require stronger confirmation

Fail when:

- risky flows allow ambiguous defaults
- same-system source/target pairs are silently accepted in workflows that imply cross-system intent
- the UI implies preview-only while execution is possible, or the reverse

## 3. Workflow Completeness

Pass when one surface can carry the user through:

- connection selection
- schema discovery
- querying
- result inspection
- safe edit/apply
- recovery and job review

Fail when a workflow breaks because one stage is only partially wired.

## 4. Contract Cohesion

Pass when all layers agree:

- `shared/schema.ts`
- frontend host API
- desktop bridge invoke payloads
- Rust request/response structs
- Tauri command registration

Fail when any layer drifts or carries dead contract surface.

## 5. Release Readiness

Pass when:

- the critical paths have regression tests
- live verification scripts or smoke gates exist
- inline UI labels match actual capability state

Fail when:

- comments or docs still describe shipped code as "planned"
- critical paths rely only on manual memory

## 6. Migration Clarity

Pass when:

- legacy paths are clearly demoted and intentionally preserved
- the primary path is obvious

Fail when:

- operators cannot tell which surface is authoritative
- new and old flows duplicate responsibility with inconsistent behavior
