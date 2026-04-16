# Contract: Object And Schema Platform

## Purpose

Define the product contract for object browsing, deep inspection, schema comparison, and adjacent schema lifecycle workflows.

## Canonical Operator Loop

The object and schema platform must support this loop:

1. browse objects from the active connection context
2. inspect live object definitions and metadata
3. open table-oriented work from the explorer
4. compare schemas across connections
5. connect those findings back to the repository's workbook and DDL flows

This platform should help operators understand live structure without pretending the workbench is already a full visual schema authoring suite.

## Object Family Coverage

### P0 Product-Critical Coverage

- tables
- views
- functions
- procedures
- triggers
- indexes
- foreign keys
- PostgreSQL sequences

These are the object families that must be treated as part of the real workbench contract.

### P1 Candidate Coverage

- richer constraint families
- dependency relationships
- materialized-view-like object families where applicable
- partitioning and advanced storage details

### P2 Candidate Coverage

- diagram-native navigation
- dependency graph visualization
- deeper schema lifecycle authoring workflows

## Inspection Depth Rules

### P0 Expectations

- object inspection must remain reachable from the explorer
- supported object families must render honest inspection content
- when inspection is generated rather than source-native, the UI must not imply source-of-truth parity
- unsupported or partial inspection must say so explicitly

### P1 Depth Expectations

- clearer differentiation between generated DDL and backend-native definitions
- richer cross-object metadata
- stronger dependency and ownership context

## Schema Diff Position

Schema diff inside DB Workbench is part of the primary product contract.

It should be positioned as:

- the live-database comparison surface for operators
- distinct from workbook-based diff and rename workflows
- part of the repository's larger schema-workbench loop

Legacy diff paths may remain during migration, but they must not compete with the canonical operator path.

## Diagram And Dependency Position

Diagram and dependency surfaces are important, but they remain later-stage until:

- runtime wiring exists
- interaction design is coherent with the desktop shell
- the feature solves a concrete operator workflow instead of acting as decorative parity

Until then, the product may describe them only as roadmap-level capabilities, not shipped depth.

## Release Gate

No object/schema capability may be marketed as `Primary` unless:

- it is reachable from the canonical workbench route
- inspection/schema payloads are wired end-to-end
- unsupported cases are explicit
- the product documentation names the supported object families honestly
