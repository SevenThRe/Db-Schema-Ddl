# Contract: Connection And Security Platform

## Purpose

Define the product-grade contract for how DB Workbench connects to databases, governs saved connections, and protects operators from environment mistakes.

## Product Contract

DB Workbench connection handling is not a raw credential form. It is an operator control plane with four responsibilities:

1. define which databases and transports are product-supported
2. make environment context visible at all times
3. preserve safe defaults such as readonly and dangerous-operation review
4. keep connection metadata organized enough for daily use

## Support Tiers

### P0 Support

- drivers: MySQL, PostgreSQL
- transport: direct network connectivity using host/port/database credentials
- saved-connection governance:
  - name
  - environment
  - readonly
  - default schema
  - favorite
  - group
  - color tag
  - operator notes
- secure saved-password behavior
- local endpoint discovery assistance

### P1 Candidate Support

- transport hardening:
  - SSH tunnel support
  - TLS/SSL configuration
  - certificate-based connection settings
- stronger validation and support diagnostics
- clearer connection capability messaging by driver

### P2 Candidate Support

- enterprise authentication modes
- broader driver catalog
- organization-level connection policy controls

## Governance Fields

The saved connection contract must keep these fields first-class:

- `environment`: `dev | test | prod`
- `readonly`
- `defaultSchema`
- `favorite`
- `groupName`
- `colorTag`
- `notes`

These are not optional cosmetic fields. They directly support connection discovery, operator trust, and mistake prevention.

## Safety Rules

### Environment Signaling

- the current connection environment must remain visible in the workbench shell
- `prod` must receive the strongest visual emphasis
- environment context must be visible in workflows that can mutate data

### Readonly Enforcement

- readonly must be enforced in the backend, not only hinted in the UI
- readonly must block:
  - mutating SQL execution
  - grid commit
  - data apply execution

### Dangerous Operation Boundaries

- dangerous SQL review must remain a product guardrail
- data apply into sensitive targets must require explicit confirmation
- safety must be fail-closed when runtime context is incomplete

## Product Messaging Rule

The product may claim:

- operator-grade connection governance
- environment-aware safety
- secure saved-password handling
- direct MySQL/PostgreSQL support

The product may not claim:

- enterprise connectivity parity
- secure tunnel parity with mature benchmark tools
- database coverage beyond wired drivers

## Release Gate

No connection-platform capability graduates to `Primary` unless:

- the shared schema reflects it
- host API and desktop bridge expose it
- Tauri runtime wiring exists
- the UI surface is reachable
- smoke and regression verification cover the intended use
