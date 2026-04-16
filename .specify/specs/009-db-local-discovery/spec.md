# Spec: Local Database Discovery

## Problem

The DB Workbench connection center still assumes the operator will manually type every local connection detail. For desktop-first database tools, this creates unnecessary setup friction when the likely target is already running on the same machine.

## Goal

Allow the operator to explicitly scan the local machine for likely MySQL and PostgreSQL endpoints, review candidates, and jump into a prefilled connection draft with one click.

## Requirements

### R1. Explicit Local Discovery

The connection center must provide a deliberate `发现本地数据库` action that scans only the local machine for supported database endpoints.

### R2. Candidate-Only Results

Discovery must return candidate instances rather than silently creating or persisting saved connections.

### R3. One-Click Prefill

Each discovered candidate must provide a quick action that opens a prefilled connection draft for review, credential completion, and optional testing.

### R4. No Network Sweep

The MVP must not scan arbitrary LAN ranges or claim authenticated access; it is limited to local-machine endpoint discovery.

## Acceptance Criteria

1. The connection center exposes a `发现本地数据库` action.
2. Triggering discovery returns zero or more local MySQL / PostgreSQL candidates with driver, endpoint, and discovery notes.
3. Operators can click a candidate to prefill a new connection draft instead of manually typing host and port.
4. No discovered candidate is saved automatically.
5. `npm run check` and `cargo check` pass after the feature lands.
