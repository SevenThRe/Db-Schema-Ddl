---
phase: 48-migrate-non-core-db-surfaces-behind-extension-boundaries-and-retire-host-leakage
plan: 02
subsystem: host-copy-and-db-tool-handoff
tags: [extensions, ddl-import, copy, shell]
completed: 2026-04-18T19:35:00+08:00
---

# Phase 48 Plan 02 Summary

The host no longer talks about DB capability as if it were a bundled shell region. Residual DB-adjacent host surfaces now hand users to the installable DB tool boundary explicitly.

## Accomplishments

- Added a tool-aware handoff in [DdlImportWorkspace.tsx](/E:/work/Db-Schema-Ddl/client/src/components/ddl-import/DdlImportWorkspace.tsx) so the live DB import empty state offers `打开数据库工具` or `前往工具管理` instead of assuming a hidden builtin workbench.
- Wired the handoff through [Dashboard.tsx](/E:/work/Db-Schema-Ddl/client/src/pages/Dashboard.tsx) using the current installed `db-connector` activity when present and the tool-management surface otherwise.
- Updated [ExtensionSecondarySidebar.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/shell/ExtensionSecondarySidebar.tsx) and localized copy in [zh.json](/E:/work/Db-Schema-Ddl/client/src/i18n/locales/zh.json) / [ja.json](/E:/work/Db-Schema-Ddl/client/src/i18n/locales/ja.json) so host chrome now speaks in tool/workspace terms.
- Neutralized the host subtitle from a permanently bundled DB-workbench statement to `Excel / DDL / Diff / Tools`.

## Verification

- `npm run check`
- `npm run check:i18n`

## Self-Check

PASS
