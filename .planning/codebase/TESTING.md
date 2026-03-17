# Codebase Testing

## Current Test Shape

The repository has both broad and targeted coverage:

- `test/behavior.test.ts`
- `test/whitebox.test.ts`
- `test/server/*.test.ts`
- targeted regression and resilience coverage for DDL and Excel parsing

## Areas With Strong Existing Coverage

- Excel parser edge cases and resilience
- DDL generation and regressions
- DDL validation
- task/runtime-related server logic
- name-fix service flows

## Areas Likely Thin For The New Project

- Electron-specific integration flows
- updater-like download/install UX beyond app update checks
- extension lifecycle management
- live DB connectivity and introspection
- file vs DB diff semantics

## Testing Direction For The New Extension Project

Required test layers:

1. Shared schema and manifest validation tests
2. Server unit tests for extension registry and catalog parsing
3. Server integration tests for install/enable/disable/uninstall flows
4. DB adapter tests for introspection normalization
5. Diff regression tests for file vs DB comparisons
6. UI integration tests for "click feature, prompt install, download extension" flow

## Recommended Test Strategy

- Keep core extension host testable without real downloads by mocking catalog assets
- Use fixture-based schema snapshots for DB diff coverage
- Treat destructive deploy actions as explicit opt-in test cases

