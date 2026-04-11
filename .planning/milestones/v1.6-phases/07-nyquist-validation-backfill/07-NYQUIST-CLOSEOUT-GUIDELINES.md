# Nyquist Closeout Guidelines (Phase 07)

Date: 2026-04-11

## Purpose

Prevent milestone-closeout drift by making Nyquist validation artifacts mandatory before milestone completion.

## Mandatory Gate Checklist

1. Every executed phase in milestone scope has `*-VALIDATION.md`.
2. Validation frontmatter includes `status`, `nyquist_compliant`, `wave_0_complete`, `created`.
3. Validation files map requirement IDs to concrete automated commands (or explicit manual-only rationale).
4. Milestone audit section "Nyquist Compliance Scan" must report `missing_phases: []` for shipped scope.
5. If any phase is missing validation, milestone completion is blocked until either:
   - file is backfilled, or
   - debt is explicitly accepted and tracked in a new milestone roadmap.

## Audit Integration

- During `$gsd-audit-milestone`, scan archived milestone phase dirs for `*-VALIDATION.md`.
- Record compliance summary in audit frontmatter under `nyquist`.
- For `workflow.nyquist_validation=true`, missing artifacts are not silent warnings.

## Operational Routine

- During execution: keep validation strategy synchronized with plan tasks.
- During verify: update status from `draft` -> `approved` when requirements are fully covered.
- During complete milestone: ensure audit output includes Nyquist section before archive finalization.
