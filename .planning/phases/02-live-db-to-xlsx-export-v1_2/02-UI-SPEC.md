---
phase: 02
slug: live-db-to-xlsx-export-v1_2
status: approved
shadcn_initialized: true
preset: new-york
created: 2026-03-18
reviewed_at: 2026-03-18T16:25:00+09:00
---

# Phase 02 — UI Design Contract

> Visual and interaction contract for `Live DB to XLSX Export`. This phase turns a live MySQL catalog into an official parser-compatible workbook while preserving the same trust gates used by other export flows.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn |
| Preset | new-york |
| Component library | Radix UI via shadcn/ui |
| Icon library | lucide-react |
| Font | Inter for UI, JetBrains Mono for schema/sql metadata |

---

## Screen Contract

### Primary Workspace
- This phase lives as a dedicated main view inside `DB 管理`, not as an inline action hidden in `History`, `Snapshot Compare`, or `关系图`.
- The screen uses a persistent three-column review layout:
  - left: source and freshness controls
  - middle: whole-database catalog review with table filtering/selection
  - right: export readiness, issue review, template selection, and final CTA

### Focal Point and Hierarchy
- Primary focal point after catalog load: the right-side `导出准备` panel showing blocker count, lossy count, chosen template, and the main export CTA.
- Secondary focal point: the center `表选择` review area with selection count and whole-database visibility.
- Supporting layer: the top context row and left-side freshness/source controls.
- Before any catalog is loaded, the focal point is the left-side source card with the primary action to start export review.

### Interaction Rules
- Users always see whole-database scope first, then narrow to selected tables; entry should never start with a hidden table picker.
- Freshness is explicit, not implicit. The user must always see whether the export uses:
  - `使用最近 snapshot`
  - `导出前刷新 live`
- Blocking issues disable the export CTA and keep the right panel visually in an alert state.
- Lossy-but-reviewable issues keep the export CTA visible, but require an explicit confirmation control before export can proceed.
- Export success immediately returns a real `.xlsx` into the standard file list and should offer a direct “open generated workbook” continuation path.

### Accessibility and Labeling
- No icon-only primary actions in the workspace body.
- Any compact icon-only controls in the header must retain visible text nearby or a tooltip fallback.
- Table-selection controls, freshness toggles, and template selectors must use text labels that remain understandable without surrounding context.

---

## Component Inventory

| Area | Components |
|------|------------|
| Header / context | `Card`, `Badge`, `Button`, `Tooltip` |
| Freshness / source controls | `RadioGroup` or segmented `Tabs`, `Select`, `Button`, `Alert` |
| Catalog review | `ScrollArea`, `Checkbox`, `Input`, `Badge`, `Card` |
| Export readiness | `Card`, `Badge`, `Alert`, `Checkbox`, `Select`, `Button` |
| Success handoff | `Toast`, optional inline success panel with workbook name |

Third-party registries: none.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline separators |
| sm | 8px | Compact controls, badge padding |
| md | 16px | Default card padding and control spacing |
| lg | 24px | Column section padding |
| xl | 32px | Main workspace gutter and panel separation |
| 2xl | 48px | Empty-state breathing room |
| 3xl | 64px | Reserved for full-page onboarding states only |

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
- Only two weights are allowed in this phase: 400 and 600.
- Uppercase micro labels use the `Label` role only.
- Schema names, snapshot hashes, and file names may switch to `font-mono` without changing size scale.

---

## Color

Usage split: `60 / 30 / 10`

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#F8FAFC` | Main background, workspace canvas, non-critical surfaces |
| Secondary (30%) | `#E2E8F0` | Cards, panel chrome, table list backgrounds, inactive tool areas |
| Accent (10%) | `#2563EB` | Primary export CTA, selected freshness mode, active tab, focus ring, selected-table count |
| Destructive | `#DC2626` | Blocking issue chips, disabled-by-risk callouts, destructive-only alerts |

Accent reserved for: primary export CTA, active workspace tab, selected freshness toggle, keyboard focus ring, selected-table summary badge.

Do not use accent for every clickable row or every border.

Semantic issue colors:
- blocking: red surface tint + red text/border
- confirm/lossy: amber surface tint + amber text/border
- info: slate/sky muted tint, never stronger than the export CTA

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | `生成 XLSX 工作簿` |
| Empty state heading | `还没有可导出的数据库目录` |
| Empty state body | `先选择连接、database 和 freshness 模式，再读取当前目录开始审阅。` |
| Error state | `导出未完成。请先处理阻断项，或切换 freshness 后重新读取目录。` |
| Destructive confirmation | `刷新 live`: `这会重新扫描当前数据库，并可能生成新的 snapshot 版本。确认继续刷新吗？` |

Secondary copy rules:
- Use `导出准备` for the right-hand review panel title.
- Use `使用最近 snapshot` and `导出前刷新 live` verbatim for freshness choices.
- Lossy confirmation copy must say `存在有损项` and require the user to acknowledge continued export intentionally.
- Success toast copy should mention both workbook creation and file-list registration in one sentence.

---

## Visual Hierarchy Notes

- The right column should visually read as the trust gate: stronger contrast, clearer counters, and the only solid primary button on screen.
- The center column should feel analytical rather than promotional: neutral surfaces, compact rows, fast scanning, and stable sticky selection summary.
- The left column should remain lightweight and operational: source context, freshness choice, and read/refresh action only.
- When blockers exist, the red summary card appears above any lossy or info sections and pushes the CTA down visually.
- When export is safe, the success path should collapse visual anxiety:
  - blocker region disappears
  - confirm checkbox disappears when not needed
  - CTA stays in the same position to prevent layout jump

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `button`, `badge`, `card`, `select`, `checkbox`, `scroll-area`, `tooltip`, `alert`, `tabs` | not required |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-03-18
