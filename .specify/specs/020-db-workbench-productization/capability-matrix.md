# DB Workbench Capability Matrix

## Ratified Product Position

DB Workbench is the repository's desktop-first schema and database operations workbench.

It is not positioned as a generic SQL IDE clone. Its release story must preserve the end-to-end loop between:

- workbook schema definition
- DDL generation and import
- live database inspection and execution
- schema diff and rename workflows
- controlled data compare, apply, and audit

## Capability Tier Model

### Tier P0. Product Truth And Daily Driver

These are the capabilities that define whether DB Workbench is a coherent, trustworthy operator product:

- one canonical workbench route
- honest labeling of primary vs secondary vs preview surfaces
- saved connections with governance metadata
- environment and readonly safety signaling
- direct MySQL and PostgreSQL connectivity
- SQL tabs, session recovery, SQL library, history, and autocomplete
- selection/statement/script execution
- parameter review and dangerous SQL review
- result browsing, bounded memory, and export
- object explorer and reachable inspection
- transactional grid update/delete review flow
- schema diff in the workbench
- live data compare/apply with blockers and job audit
- release verification and desktop smoke coverage

### Tier P1. Product Depth

These capabilities deepen professional quality once P0 is stable:

- richer secure connectivity support
- deeper object-family coverage and dependency awareness
- stronger explain and query diagnostics
- broader data-editing pathways such as insert/import-assisted flows
- stronger query/session observability

### Tier P2. Strategic Expansion

These capabilities are valuable but must remain explicitly later-stage:

- ER/diagram and dependency graph surfaces
- expanded driver catalog
- enterprise connectivity and authentication modes
- deeper schema lifecycle authoring tools

## Surface Status Matrix

| Surface | Status | Current Runtime Truth | Product Stance |
| --- | --- | --- | --- |
| `Database Workspace` in `DbConnectorWorkspace.tsx` | Primary | Canonical operator route when a connection is selected | Daily-driver surface |
| `Connection Center` | Primary Support Surface | Reachable and needed to launch/manage workbench sessions | Primary support surface, not the product's main work area |
| `Object Explorer` + `Inspect` | Primary | Reachable in the workbench sidebar/result tabs | Daily-driver inspection surface |
| `SQL tabs / library / history / autocomplete` | Primary | Reachable and connection-scoped | Daily-driver authoring surface |
| `Result grid browsing/export` | Primary | Reachable with load-more and export constraints | Daily-driver results surface |
| `Grid edit commit review` | Primary With Constraints | Reachable only on safe editable result sources | Primary, but must remain fail-closed and explicitly constrained |
| `Schema Diff` inside workbench | Primary | Reachable from workbench result tabs | Primary comparison surface |
| `Data Sync Apply` + `Job Center` | Preview | Reachable and real, but still advanced and safety-heavy | Advanced preview until broader validation and operator polish are complete |
| Legacy `Schema` path | Secondary | Still reachable for migration and regression protection | Secondary migration-only surface |
| Legacy `DIFF` path | Secondary | Still reachable for migration and regression protection | Secondary migration-only surface |
| Live release verification hooks | Internal | Runtime-wired for smoke/release flows | Internal only, never marketed as operator product surface |

## Driver And Connectivity Truth

### Currently Product-Supported

- MySQL direct connectivity
- PostgreSQL direct connectivity
- saved credentials with secure password storage behavior
- localhost discovery assistance

### Explicitly Not Yet Product-Supported

- SSH tunneling as a release claim
- TLS/SSL configuration as a release claim
- enterprise auth modes such as Kerberos or SSO
- Oracle / SQL Server / SQLite / MariaDB driver parity claims

These may be designed for future waves, but they must remain out of the product claim set until runtime support is wired and verified.

## Capability Claim Rules

- `Primary` means daily-driver, documented, smoke-covered, and release-gated.
- `Primary With Constraints` means primary only within explicit runtime guardrails that are shown in the UI.
- `Preview` means reachable and real, but not yet broad enough to market as mature default workflow.
- `Secondary` means intentionally retained during migration or for specialized support paths.
- `Internal` means not part of the operator-facing product claim set.

## Release Note Rule

No release note, help text, or sales-style description may flatten these status levels. If a feature is `Preview` or `Secondary`, the product language must say so.
