# Spec: DB Connection Platform P0

## Problem

The connection center already has governance metadata and safety semantics, but DB Workbench still lacks a product-grade connection-platform contract in the primary operator experience. Operators need clearer support truth, safer environment context, and more coherent connection guidance before the workbench can be treated as a finished daily driver.

## Goal

Harden the P0 connection platform by making support truth, governance fields, and operator safety clearer and more coherent in the product surface.

## Requirements

### R1. Supported Driver And Connectivity Scope Must Be Explicit

The product surface must clearly communicate which connection modes are supported in the current build rather than leaving operators to infer support breadth.

### R2. Governance Metadata Must Remain First-Class

Environment, readonly, default schema, favorite, group, color tag, and operator notes must remain visible and understandable as product-level connection controls.

### R3. Safety Meaning Must Be Clear In Daily Work

Operators must be able to understand how readonly, environment labels, and dangerous-operation review affect actual workbench execution behavior.

### R4. Future Secure Connectivity Must Be Left Room Without False Claims

This wave may prepare the product surface for future secure-connectivity depth, but it must not imply SSH/TLS/enterprise auth support unless runtime wiring is real.

## Acceptance Criteria

1. The connection platform communicates current support scope honestly.
2. Governance and safety fields read as operator controls rather than incidental metadata.
3. No unsupported secure-connectivity claim is introduced.
4. `npm run check` and `cargo check` pass.
