# UI Audit & Refactor Agent Guide

## Mission

Turn this product from a feature pile into a credible database workbench.

The target feeling is:

- precise, premium, technical
- calm under heavy information density
- closer to DataGrip / DBeaver / TablePlus than a generic CRUD dashboard
- obvious next actions, minimal hesitation, strong context awareness

## Product North Star

This app is not "a website with forms".
It is a desktop-grade schema workspace for people moving between Excel definitions, parsed structures, database snapshots, diff workflows, and generated DDL.

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
- subtle depth, glass, grid, and glow only where it improves orientation

Avoid:

- generic SaaS cards everywhere
- tiny low-contrast labels
- flat white emptiness with random borders
- "feature buttons" that do not explain workflow position
- mixing too many visual idioms in one screen

## Professional DB Tool Baseline

When redesigning DB-related screens, align with these conventions:

- persistent left navigation for assets / modules
- clear active context strip for current file, sheet, connection, and database
- top command area for primary actions, never bury core actions in body copy
- workspaces grouped by mode, with explicit mode descriptions
- object lists optimized for scan speed, not marketing aesthetics
- diff, apply, history, graph, and export treated as serious operator tasks
- destructive actions visually separated and confirmed
- empty states must teach the next step, not merely state absence

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
- Empty/loading/error/success states intentionally designed
- Hover, focus, selected, pending, disabled states visually distinct

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

- prefer durable layout primitives over one-off visual hacks
- use shared visual tokens before inventing local colors
- do not add tiny labels just to fit more controls; restructure instead
- favor fewer, stronger surfaces over many weak card borders
- every new panel must declare its purpose in one short line
- when in doubt, optimize for operator confidence over visual novelty
