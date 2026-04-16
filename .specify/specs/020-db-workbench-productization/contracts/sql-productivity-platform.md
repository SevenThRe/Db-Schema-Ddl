# Contract: SQL Productivity Platform

## Purpose

Define the daily-driver product contract for SQL authoring, execution, review, reuse, and diagnostics.

## Product Position

DB Workbench SQL productivity should feel professional and trustworthy, but it should not overclaim benchmark-tool parity where the runtime model is intentionally narrower.

The product promise is:

- coherent authoring flow
- safe execution flow
- useful reuse and recovery
- honest diagnostics

## Daily-Driver Workflow

The canonical SQL workflow is:

1. open or restore a connection-scoped query tab
2. author SQL with schema-aware assistance
3. reuse snippets/history from the SQL library
4. run selection, current statement, or full script
5. review parameters and dangerous operations before execution when needed
6. inspect results, explain plans, and query history
7. cancel or continue work without losing session context

## P0 Product Contract

### Query Tabs And Session Recovery

- tabs are connection-scoped
- active tab, SQL draft, active schema, selected object context, and result-tab context remain recoverable

### SQL Reuse

- snippets, recent queries, and run history form one reuse model
- reuse remains connection-scoped

### Authoring Assistance

- schema-aware autocomplete remains first-class
- keyword/template assistance is part of the product contract
- current-context bias is part of the product contract

### Execution Modes

- selection execution
- current statement execution
- full script execution
- stop-on-error behavior that remains explicit

### Pre-Run Review

- parameter review must remain part of the standard flow
- dangerous SQL review must remain part of the standard flow
- script review must remain part of the standard flow for multi-statement execution

### Diagnostics

- explain visualization is part of the product contract
- cancellation is part of the product contract
- query history is part of the product contract

## Honest Constraint Rules

The product must not overstate these areas:

- parameter review currently renders reviewed SQL values; it must not be marketed as a full prepared-statement execution framework
- explain is normalized plan visualization, not full benchmark-grade profiler parity
- load-more and full-export behavior remain constrained by runtime paging support

These constraints are acceptable as long as they are explicit and consistent.

## P1 Candidate Depth

- richer query diagnostics and observability
- stronger authoring assistance
- stronger long-running execution ergonomics
- broader query/session management surfaces

## Release Gate

No SQL productivity feature is `Primary` unless:

- it flows through the canonical execution path
- safety review is not bypassed
- session persistence remains intact
- cancellation and stale-response behavior are verified
