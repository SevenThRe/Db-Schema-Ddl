# Spec: Query Run History

## Problem

DB Workbench already has a SQL library with saved snippets and a legacy recent-query list, but executed SQL is still treated as an ephemeral action. Operators cannot see which statements or scripts ran recently, whether they succeeded or partially failed, or quickly reuse those runs with the same context density expected from paid database tools.

## Goal

Make SQL execution trackable and reusable by adding connection-scoped query run history with execution metadata, then surface that history inside the existing SQL Library workflow.

## Requirements

### R1. Query Runs Must Be Persisted Per Connection

Each connection-scoped workbench session must retain a bounded history of recent SQL runs with timestamp, run mode, execution outcome, and summary metadata.

### R2. Success And Failure Must Both Be Represented

Run history must record successful, partially failed, and failed executions. User-triggered cancellations must not be misrepresented as failures.

### R3. SQL Library Must Surface Run History As A First-Class Group

The existing SQL Library dialog must show run history entries with enough metadata to distinguish statement vs script runs and scan success/failure state before reusing the SQL.

### R4. Backward Compatibility Must Be Preserved

Existing sessions that only contain legacy `recentQueries` must continue to load without breakage. The new history model must not erase existing snippet or tab state.

## Acceptance Criteria

1. Running statement or script SQL creates a connection-scoped run-history entry with status, mode, timestamp, and SQL text.
2. Failed executions are retained in run history, while cancellation paths are not recorded as failures.
3. SQL Library shows a `Run history` group with metadata-rich entries and still supports legacy recent-query fallback for older sessions.
4. `npm run check` passes.
5. Targeted client tests for session storage, run-history helpers, and SQL Library integration pass.
