# UI Audit & Refactor Agent Guide

## Mission

Turn this product from a feature pile into a credible database workbench.

The target feeling is:

- precise, premium, technical
- calm under heavy information density
- closer to DataGrip / DBeaver / TablePlus than a generic CRUD dashboard
- obvious next actions, minimal hesitation, strong context awareness

## Reality Check First

This guide is about UI and product direction. It is not the source of truth for what is already shipped.

Before proposing or implementing DB workspace changes:

1. Verify the reachable workspace path in:
   - `client/src/components/extensions/DbConnectorWorkspace.tsx`
   - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
2. Verify the shared contract in:
   - `shared/schema.ts`
3. Verify the desktop wiring in:
   - `client/src/lib/desktop-bridge.ts`
   - `client/src/extensions/host-api.ts`
   - `src-tauri/src/db_connector/*`

Treat `docs/db-workbench-extension-design.md` and `docs/db-workbench-data-sync-design.md` as target-state design docs unless the route is visibly wired in code.

## Current Product Truth

The app is not "a website with forms".
It is a desktop-grade schema workspace for people moving between Excel definitions, parsed structures, database snapshots, diff workflows, generated DDL, and live DB operations.

The product currently has two concurrent realities:

- the long-standing Excel / DDL conversion flow
- the newer DB Workbench / extension-host desktop workflow

The DB Workbench already includes:

- live connection management
- schema introspection with table, column, index, and foreign-key detail
- Monaco-based SQL editing
- query execution and cancellation
- EXPLAIN plan visualization
- dangerous SQL confirmation
- result-grid browsing and export-oriented review

The DB Workbench does not yet justify assuming these are finished end-user features:

- data-sync as a first-class reachable workspace
- general-purpose row editing and commit
- ER authoring / drag-to-model workflows
- every design-doc phase being fully wired end to end

## Product North Star

Every screen should answer three questions immediately:

1. Where am I?
2. What object am I acting on?
3. What is the next safe action?

## Design Direction

Use an editorial-industrial workbench aesthetic:

- graphite and ink surfaces
- bright paper-like data canvases
- restrained cobalt accent for active state and key actions
- dense but breathable spacing
- strong typography hierarchy with technical monospace support
- subtle depth, grid, and glow only where it improves orientation

Avoid:

- generic SaaS cards everywhere
- tiny low-contrast labels
- flat white emptiness with random borders
- "feature buttons" that do not explain workflow position
- mixing too many visual idioms in one screen

## Professional DB Tool Baseline

When redesigning DB-related screens, align with these conventions:

- persistent left navigation for assets and modules
- clear active context strip for current file, sheet, connection, and database
- top command area for primary actions
- workspaces grouped by mode, with explicit mode descriptions
- object lists optimized for scan speed
- diff, apply, history, graph, and export treated as operator tasks
- destructive actions visually separated and confirmed
- empty states must teach the next step

## Audit Rubric

### 1. Information Architecture

- Is the primary workflow visible without reading paragraphs?
- Are related actions grouped by task phase?
- Does each panel have one job?

### 2. Context Fidelity

- Does the UI always show current file, sheet, connection, database, and active mode?
- Can users recover orientation after changing modes?

### 3. Scanability

- Can users distinguish navigation, metadata, actions, and results at a glance?
- Are dense lists readable in under 3 seconds?

### 4. Interaction Quality

- Primary actions obvious, secondary actions quieter
- Empty, loading, error, and success states intentionally designed
- Hover, focus, selected, pending, and disabled states visually distinct

### 5. Domain Fit

- Does this look and behave like a serious DB/schema tool?
- Would a DBeaver/DataGrip user understand the mental model quickly?

## Refactor Sequence

### Phase 1. Shell & Navigation

- upgrade global typography, color tokens, and shell chrome
- redesign app header and workspace framing
- make module switching and current context unmistakable

### Phase 2. Core Workspace

- improve sheet/file browsing hierarchy
- improve preview/DDL split and command affordances
- reduce dead empty space while preserving breathing room

### Phase 3. DB Management

- elevate DB workspace into a control center
- separate connection setup, database selection, introspection, diff/apply/history workflows
- make "what to do next" obvious for first-time and returning users

### Phase 4. Microstates

- polish loading, empty, confirmation, validation, and success states
- standardize badges, pills, panel headers, and status surfaces

## Definition Of Done

A UI change is not complete unless:

- the current object and mode are obvious
- the next primary action is obvious
- the screen looks intentional at both 1440px desktop and compact layout
- active, hover, focus, loading, empty, and destructive states are coherent
- the screen feels like a database workbench, not a random admin page

## Working Rules For Future Changes

- verify runtime reachability before calling a feature "present"
- prefer durable layout primitives over one-off visual hacks
- use shared visual tokens before inventing local colors
- do not add tiny labels just to fit more controls; restructure instead
- favor fewer, stronger surfaces over many weak card borders
- every new panel must declare its purpose in one short line
- when in doubt, optimize for operator confidence over visual novelty
- when a design doc and runtime behavior differ, update the runtime-truth docs too
