# Plan: Local Database Discovery

## Summary

This wave adds an operator-triggered local discovery path to the DB Workbench connection center. The backend will probe common localhost ports for the currently supported drivers and return candidate metadata. The frontend will surface those candidates as quick-fill actions that open the existing connection form.

## Scope

- Add shared discovery result contracts.
- Add host API and desktop bridge methods for local discovery.
- Register a new Tauri command and implement a local-only endpoint probe for MySQL and PostgreSQL.
- Add a discovery panel in the DB Workbench connection center with one-click prefill actions.

## Likely Touchpoints

- `shared/schema.ts`
- `client/src/extensions/host-api.ts`
- `client/src/extensions/host-api-runtime.ts`
- `client/src/extensions/host-context.tsx`
- `client/src/lib/desktop-bridge.ts`
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/discover.rs`
- `src-tauri/src/lib.rs`

## Risks

- Localhost port probing can only prove that an endpoint is listening; it cannot prove credentials, schema visibility, or safe access.
- Prefilled defaults must remain clearly editable because system databases and default usernames are only convenience guesses.
- The scan should stay tightly bounded to avoid feeling like a network scanner.

## Verification

- `npm run check`
- `cargo check`
- Manual check in desktop app: run discovery, inspect candidate cards, prefill a connection draft, and confirm nothing is auto-saved
