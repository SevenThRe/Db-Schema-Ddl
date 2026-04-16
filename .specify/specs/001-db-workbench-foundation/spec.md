# Spec: DB Workbench Foundation Toward Industry Standard

## Problem

The DB Workbench already has real operator workflows, but several core gaps keep it below replacement-grade database tools:

- Data Sync compare is still placeholder-based rather than true cross-connection comparison.
- Data Sync apply previously looked executable despite being simulated.
- Object browsing was weak for larger schemas.
- Some execution-class paths were inconsistent with runtime connection hydration and schema context.

## Goal

Raise the DB Workbench from a partially credible tool to a trustworthy operator foundation that can support the next wave of professional features.

## Non-Goals

- Full SSH/SSL/TLS connection support in this wave
- Visual ER authoring
- Complete replacement of legacy shell paths
- Full real data apply engine in this wave

## Requirements

### R1. Honest Sync Execution State

The product must not present simulated apply behavior as real database execution.

### R2. Real Compare Engine

Data Sync compare must read real source and target data for selected tables and produce actual counts, samples, and detail rows.

### R3. Large-Schema Usability

Operators must be able to quickly filter objects by table, view, column, index, and foreign key names from the workbench sidebar.

### R4. Connection And Schema Consistency

Diff and Explain must use runtime-hydrated connections, and Explain must honor the active PostgreSQL schema context.

### R5. Explicit Delivery Artifacts

The repository must contain harness-style delivery artifacts that define constitution, feature scope, plan, and executable tasks.

## Acceptance Criteria

1. Data Sync Apply is visibly preview-only and backend execution is blocked with a clear message.
2. Sidebar filtering works across tables, views, columns, indexes, and foreign keys without breaking current open/run workflows.
3. `db_diff` and `db_query_explain` use runtime connections, and PostgreSQL Explain respects the active schema.
4. `.specify/` contains constitution, plan, and tasks for this feature wave.
5. Remaining gap for real Data Diff is explicitly tracked as the next P0 implementation item.
