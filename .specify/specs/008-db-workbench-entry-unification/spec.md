# Spec: Unified DB Workbench Entry UX

## Problem

The current DB Workbench entry shell exposes `连接 / Schema / Diff / SQL 工作台` as peer tabs. That leaks implementation history directly into the product and fragments one database workbench into multiple first-level surfaces. Industry-standard DB tools treat connection management, object browsing, querying, and comparison as one coherent workspace, with older or auxiliary tools demoted behind secondary navigation.

## Goal

Make the DB Workbench entry read as one primary workspace with legacy tools clearly demoted, while preserving the existing schema browser and diff flows for migration safety.

## Requirements

### R1. Workbench-First Entry

When a connection is active, the primary navigation must emphasize one unified database workspace rather than a separate `SQL 工作台` peer tab.

### R2. Legacy Tool Demotion

The existing schema browser and diff flows must remain reachable, but only as secondary legacy actions rather than equal first-level tabs.

### R3. Connection Center As Setup Surface

Connection management must remain reachable as the setup and administration surface, without implying that it is a separate main product area once the operator is already inside the workbench.

### R4. No Capability Regression

This wave must not remove the legacy schema or diff implementations; it only changes the entry-shell information architecture and presentation.

## Acceptance Criteria

1. The top entry shell no longer shows `连接 / Schema / Diff / SQL 工作台` as one segmented first-level tab set.
2. The primary entry communicates one unified `Database workspace` surface.
3. Schema browser and diff remain available as clearly labeled legacy secondary actions.
4. Existing connection selection, schema browsing, diff comparison, and workbench routing continue to function.
