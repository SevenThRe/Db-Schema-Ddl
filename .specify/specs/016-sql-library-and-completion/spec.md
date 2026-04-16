# Spec: SQL Library And Completion

## Problem

DB Workbench already has saved snippets, recent query capture, and schema-aware autocomplete. But the current operator experience is still basic: snippets and history are exposed as two crude toolbar selects without search or preview, snippets cannot be deleted from the workbench, and autocomplete mostly behaves like a raw object list instead of a productivity surface. Paid database tools make SQL reuse and completion feel immediate; this workbench still makes operators hunt for past queries and retype too much.

## Goal

Turn the SQL editor into a more professional daily-driver surface by unifying snippets/history into a searchable SQL library and upgrading autocomplete to better reflect operator intent.

## Requirements

### R1. SQL Reuse Must Be Reachable Through A Unified Library

The workbench must expose a searchable SQL library that unifies saved snippets and recent queries. Operators must be able to preview an entry before applying it.

### R2. SQL Library Actions Must Support Real Workflows

From the SQL library, operators must be able to replace the active tab SQL or open the selected entry in a new query tab. Saved snippets must also support deletion from the same workflow.

### R3. Snippet And History State Must Stay Connection-Scoped

All SQL library entries must continue to be scoped to the active connection session. Deleting or reusing a snippet must only affect that connection's stored session state.

### R4. Autocomplete Must Better Support Query Authoring

Autocomplete must continue to use schema snapshot data, but it must also offer SQL keyword/template suggestions and bias relation/column suggestions toward the operator's active workbench context, especially the currently selected table.

## Acceptance Criteria

1. The old toolbar selects for snippets/history are replaced with a searchable SQL library workflow that supports preview, replace-active-tab, and open-in-new-tab actions.
2. Saved snippets can be deleted from the workbench, and the session store reflects that change only for the active connection.
3. Autocomplete surfaces SQL authoring keywords/templates and prioritizes context-relevant relations/columns instead of only returning a flat object list.
4. `npm run check` passes.
5. Targeted client tests covering session/library helpers and autocomplete behavior pass.
