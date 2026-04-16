# DB Workbench Constitution

Version: 1.1
Date: 2026-04-16

## 1. Runtime Truth First

Runtime code, wired commands, and reachable UI paths take precedence over docs and design notes. No feature may be claimed as shipped unless the frontend surface, shared contract, bridge, and Tauri command are all wired.

## 2. Shared Contract Before Feature Drift

`shared/schema.ts` is the contract between UI and backend. Any DB Workbench feature change must update contract, bridge, backend payloads, and consumers together.

## 3. Operator Safety Over Convenience

Readonly enforcement, dangerous SQL review, explicit previews, and honest feature states are mandatory. Simulated execution must never be presented as real execution.

## 4. Desktop Tooling Over Marketing UI

The DB Workbench must feel like a dense native database tool: panes, stable controls, explicit state, monospace for code/data, and low ornamentation.

## 5. Incremental, Verifiable Delivery

Changes should land in small waves with clear acceptance criteria, file ownership, and verification steps. Prefer reliable P0 foundations over broad speculative rewrites.

## 6. Reachability And Recoverability

Session state, connection context, and failure modes must remain visible and recoverable. Partial or preview-only workflows must be labeled clearly in the UI.

## 7. Product Coherence Before Surface Spread

DB Workbench must evolve toward one coherent operator product rather than a pile of unrelated surfaces. New capabilities must declare whether they are primary, secondary, preview, or internal, and product claims must reflect that status honestly.
