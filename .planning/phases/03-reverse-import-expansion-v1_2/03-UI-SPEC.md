---
phase: 03
slug: reverse-import-expansion-v1_2
status: approved
shadcn_initialized: true
preset: new-york
created: 2026-03-18
reviewed_at: 2026-03-18T17:25:00+09:00
---

# Phase 03 — UI Design Contract

> Visual and interaction contract for expanding reverse import from the current MySQL pasted-DDL path into SQL bundles and a first-cut Oracle subset, while preserving the shared canonical review and workbook-export workflow.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn |
| Preset | new-york |
| Component library | Radix UI via shadcn/ui |
| Icon library | lucide-react |
| Font | Inter for UI, JetBrains Mono for SQL/source/provenance metadata |

---

## Screen Contract

### Primary Workspace
- Phase 3 stays inside the existing `DDL import` workspace rather than creating a second reverse-import module.
- The workspace keeps a persistent three-column review layout:
  - left: source mode and SQL input
  - middle: canonical review and table scope
  - right: issues, supported/lossy state, template choice, and export CTA

### Focal Point and Hierarchy
- Before preview: the left input/source-mode card is the focal point.
- After preview: the right-hand trust/export panel becomes the primary focal point.
- The center review column is the analytical surface and should never compete visually with the export CTA.
- Source-mode switching must remain clearly visible because this phase adds new reverse-import modes rather than a brand-new workspace.

### Interaction Rules
- Users always start by choosing a source mode:
  - `粘贴 SQL`
  - `上传 SQL 文件`
  - `上传 SQL bundle`
- Dialect context must remain explicit. Oracle subset import should be labeled as a constrained mode, not as generic “Oracle support”.
- Unsupported statements or inexpressible constructs keep the export CTA disabled and surface a clear unsupported summary.
- Lossy-but-reviewable constructs require an explicit acknowledgment control before export.
- Export success returns the generated workbook into the normal file list and should keep the existing “activate generated file” handoff pattern.

### Accessibility and Labeling
- No icon-only primary actions in the workspace body.
- Source-mode controls, dialect indicators, issue chips, and export gating must stay readable without color alone.
- SQL/source area must preserve keyboard-friendly input behavior for paste-heavy workflows.

---

## Component Inventory

| Area | Components |
|------|------------|
| Source mode and input | `Tabs`, `Button`, `Textarea`, `Input`, `Badge`, `Alert` |
| Canonical review | `ScrollArea`, `Checkbox`, `Badge`, `Card`, `Separator` |
| Issue/export rail | `Card`, `Alert`, `Badge`, `Checkbox`, `Select`, `Button`, `Tooltip` |
| Success handoff | `Toast`, optional inline success notice |

Third-party registries: none.

---

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | inline icon and chip gaps |
| sm | 8px | compact controls and badges |
| md | 16px | standard section spacing |
| lg | 24px | panel padding |
| xl | 32px | workspace gutter |
| 2xl | 48px | empty-state spacing |

Exceptions: none

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 | 1.5 |
| Label | 11px | 600 | 1.3 |
| Heading | 18px | 600 | 1.25 |
| Display | 24px | 600 | 1.1 |

Rules:
- Only weights `400` and `600`
- SQL text, statement ids, and entity keys may use `font-mono`
- Issue summaries should stay compact and scannable, not oversized

---

## Color

Usage split: `60 / 30 / 10`

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#F8FAFC` | background and base surfaces |
| Secondary (30%) | `#E2E8F0` | cards, review rows, panel chrome |
| Accent (10%) | `#2563EB` | primary preview/export CTAs, active source mode, focus ring |
| Destructive | `#DC2626` | blocking and unsupported states |

Semantic issue colors:
- blocking / unsupported: red
- confirm / lossy: amber
- info: slate/sky muted

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Source panel title | `导入来源` |
| Primary preview CTA | `预览导入` |
| Middle panel title | `结构审阅` |
| Right panel title | `问题与导出` |
| Lossy acknowledgment | `存在有损项` |
| Unsupported state label | `存在不受支持项` |
| Primary export CTA | `导出 XLSX 并加入文件列表` |
| Empty state heading | `还没有可审阅的结构` |
| Empty state body | `先选择来源模式并提供 SQL 内容，再开始预览解析。` |
| Error state | `导入未完成。请先处理不受支持项，或调整来源内容后重新预览。` |

Secondary copy rules:
- Bundle mode should be described as schema-oriented, not general SQL execution.
- Oracle mode should include “subset” or equivalent constrained wording in supporting text.
- Unsupported statements should be described as out-of-scope rather than “ignored”.

---

## Visual Hierarchy Notes

- Left column should feel like an input console, not a heavy form.
- Center column should emphasize table/column review and provenance, not raw SQL decoration.
- Right column should behave as the trust gate with the strongest contrast and the only solid action buttons.
- Switching between MySQL and Oracle-oriented input modes should not cause the whole workspace layout to jump.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `button`, `badge`, `card`, `tabs`, `textarea`, `select`, `checkbox`, `alert`, `scroll-area`, `tooltip` | not required |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-03-18
