---
phase: 02-packaged-build-smoke-v1_3
milestone: v1.3
status: researched
updated: 2026-03-18
---

# Phase 2 Research

## Scope

Research target: **how to implement packaged Windows smoke validation well** for:

- `win-unpacked`
- `nsis installer`

without turning this phase into a full Electron E2E lab.

This research is prescriptive. It assumes the phase boundary is already fixed by:
- [02-CONTEXT.md](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/.planning/phases/02-packaged-build-smoke-v1_3/02-CONTEXT.md)
- [ROADMAP.md](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/.planning/ROADMAP.md)

---

## Standard Stack

Use this stack for Phase 2.

### Build and package

- Keep using **`electron-builder`** for Windows packaging.
- Keep **`nsis`** as the installer target.
- Keep **`win-unpacked`** as the primary iterative smoke surface because it is faster to launch and inspect than running the installer each time.

Why:
- The repo already ships via `electron-builder` in [package.json](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/package.json).
- Official docs describe NSIS as the Windows installer target and the repo is already configured for it: [electron-builder NSIS docs](https://www.electron.build/nsis.html), [electron-builder Windows target docs](https://www.electron.build/win.html).

### Runtime observability

- Reuse the Phase 1 bootstrap logging path from [electron/main.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/electron/main.ts).
- Standardize packaged smoke around Electron’s log directory semantics instead of inventing a parallel path convention.
- Prefer Electron’s built-in logs path API semantics for future alignment. Electron documents `app.setAppLogsPath()` / `app.getPath("logs")` as the default log location, with Windows logs living under app data / `userData`: [Electron app docs](https://www.electronjs.org/docs/latest/api/app).

Recommendation:
- Do **not** replace the current Phase 1 bootstrap log path mechanism in this phase.
- Do add packaged-smoke metadata that records:
  - actual `userData`
  - actual logs path
  - actual executable path
  - package mode (`win-unpacked` or `nsis-installed`)

### Screenshot capture

- Use **Electron’s built-in `BrowserWindow.capturePage()`** when screenshots can be taken from a running packaged app.
- Electron officially supports page capture from the main process via `BrowserWindow.capturePage()`: [Electron BrowserWindow docs](https://www.electronjs.org/docs/latest/api/browser-window).

Recommendation:
- Prefer app-native screenshots over adding a new browser automation stack.
- If a screenshot cannot be captured in-process for a specific failure mode, allow manual screenshot attachment as fallback evidence.

### Smoke artifact format

- Reuse the existing structured artifact seam from:
  - [shared/schema.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
  - [script/desktop-smoke.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/script/desktop-smoke.ts)
- Extend it instead of creating a second packaged-only report format.

Recommendation:
- Add packaged-smoke-specific fields to the same artifact family:
  - `distributionMode`
  - `installerArtifactPath`
  - `executablePath`
  - `screenshotPaths`
  - `logExcerpt`
  - `blockerFindings`

### Automation level

- Use **Node + PowerShell + existing npm scripts** as the automation floor.
- Keep `node:test` for focused validation.
- Keep packaged smoke as a **semi-automated seam**:
  - scripted launch / collect / summarize where easy
  - manual proof only where Windows installer UX makes full automation brittle

Confidence: **high**

---

## Architecture Patterns

### 1. One smoke artifact family, multiple run modes

Recommended pattern:

- Keep one core smoke artifact model
- Add a `runMode` or equivalent discriminator:
  - `dev-electron`
  - `packaged-win-unpacked`
  - `packaged-nsis`

Why:
- Phase 1 already established a reusable machine-friendly seam.
- MCP/AI flows will work better if packaged smoke is an extension of the same structure, not a sibling format.

### 2. Split packaged smoke into two subflows

Recommended internal architecture:

- **Subflow A: `win-unpacked` smoke**
  - build packaged app
  - launch exe directly
  - wait for readiness signal / window evidence / bootstrap checkpoints
  - collect screenshot + log evidence
  - close app
- **Subflow B: `nsis` smoke**
  - run installer
  - verify install location / first run
  - capture install + first-launch evidence
  - close app
  - optionally uninstall / verify cleanup when relevant

Why:
- The two surfaces share artifact/report structure but differ sharply in control flow.
- Keeping them separate avoids tangled scripts.

### 3. Use release-blocker classification inside artifact generation, not only in docs

Recommended pattern:

- Treat blocker classification as data, not prose.
- Artifact output should include structured findings like:
  - `severity`
  - `blocker: true|false`
  - `code`
  - `message`
  - `evidenceRefs`

Why:
- This allows the same packaged-smoke result to power:
  - human review
  - CI gating later
  - MCP summarization

### 4. Prefer checkpoint-driven readiness over arbitrary sleep

Recommended readiness strategy:

- First check bootstrap log checkpoints already written by [electron/main.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/electron/main.ts)
- Then check window/process liveness
- Only use bounded retries/timeouts as fallback

Why:
- Packaged startup timing is noisy.
- Fixed sleep values are fragile and make smoke flaky.

### 5. Keep installer smoke semi-manual by default

Recommended pattern:

- `win-unpacked` can be more script-driven
- `nsis` should allow a semi-manual path with structured evidence attachment

Why:
- Installer UI, elevation, and per-machine/per-user behavior make full automation expensive
- Context says Phase 2 is not a full automation phase

Confidence: **high**

---

## Don’t Hand-Roll

### Don’t hand-roll a second reporting format

Do not create:
- a separate packaged-smoke JSON schema
- a separate Markdown format unrelated to Phase 1 smoke

Reuse and extend the Phase 1 artifact model instead.

### Don’t hand-roll screenshot infrastructure if `capturePage()` is sufficient

Electron already exposes `BrowserWindow.capturePage()`. Use that first.

### Don’t hand-roll installer orchestration beyond minimal Windows script wrappers

Do not build a custom installer automation framework.

Use:
- `electron-builder`
- existing NSIS config
- simple PowerShell wrappers for:
  - launching installer
  - waiting for process exit
  - locating install path
  - collecting logs/evidence

### Don’t hand-roll packaged log discovery rules unrelated to Electron’s documented paths

Future-proof packaged logging by staying consistent with Electron’s `logs` / `userData` semantics.

### Don’t hand-roll full browser UI automation here

This phase should not introduce Playwright/WinAppDriver/Spectron-like infrastructure just to prove packaged smoke.

Confidence: **high**

---

## Common Pitfalls

### 1. Native module ABI drift between Node and Electron

This repo already hit this with `better-sqlite3`.

Implication for Phase 2:
- packaged build flows and Node test flows must remain explicitly separated
- packaged smoke helpers must not accidentally poison Node-side native expectations

Use:
- `rebuild:native:electron` for packaged runs
- `rebuild:native:node` for Node test runs

### 2. Packaged paths differ from dev paths

In packaged mode, [electron/main.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/electron/main.ts) already switches:
- uploads into `userData/uploads`
- db into `userData/data`
- assets into `process.resourcesPath`

Implication:
- packaged smoke must record actual resolved paths in the artifact
- path assumptions from dev mode should not be reused silently

### 3. First-launch timing is slower and less deterministic

Installer first-run and packaged first-run may be delayed by:
- extraction
- installer completion
- antivirus / Windows Defender
- first SQLite init/migration

Implication:
- readiness must be checkpoint-based and retry-based
- avoid short fixed sleeps as the main detector

### 4. NSIS install/uninstall state can be sticky

The repo already has custom NSIS logic in [installer.nsh](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/build/installer.nsh), including delayed cleanup and registry reuse.

Implication:
- Phase 2 must explicitly account for:
  - previous install location reuse
  - delayed uninstall cleanup
  - per-machine install mode
- do not assume every installer run starts from a pristine machine

### 5. A window opening is not enough

Packaged smoke should not declare success just because the exe launches.

Required proof must extend to:
- interactive main window
- SQLite/migration success
- extension entry behavior
- `DB 管理` access
- clean close

### 6. Screenshot capture may fail on pre-window failures

If the app fails before the main window is ready, `capturePage()` may not help.

Implication:
- artifact format must support missing screenshots and substitute:
  - log excerpts
  - manual screenshot attachment
  - process exit/failure metadata

Confidence: **high**

---

## Code Examples

### Example 1: extend the existing smoke artifact, don’t replace it

Pattern:

```ts
type PackagedRunMode = "packaged-win-unpacked" | "packaged-nsis";

interface PackagedSmokeExtension {
  runMode: PackagedRunMode;
  executablePath: string;
  screenshotPaths: string[];
  logExcerpt?: string;
  blockerFindings: Array<{
    code: string;
    blocker: boolean;
    message: string;
  }>;
}
```

Use this as an additive extension to the existing artifact family in [shared/schema.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts).

### Example 2: checkpoint-first readiness

Preferred order:

1. Launch packaged exe
2. Tail/read bootstrap log
3. Wait for a known checkpoint like:
   - `server_bootstrap_ready`
   - `browser_window_loaded`
4. Only then capture screenshot / continue flow

This is more stable than “sleep 5 seconds then hope”.

### Example 3: installer smoke as semi-automated evidence capture

Recommended workflow:

1. Build installer
2. Launch installer from a small PowerShell helper
3. Record:
   - installer path
   - install directory
   - timestamps
4. Start installed app
5. Collect screenshot and log excerpt
6. Write Markdown + JSON evidence

### Example 4: use Electron-documented logs behavior as the contract

Electron documents that logs can live under the logs path / `userData` on Windows: [Electron app docs](https://www.electronjs.org/docs/latest/api/app).

This phase should prefer:
- `app.getPath("logs")`
- or a stable equivalent already aligned with `userData/logs`

over ad-hoc path guessing.

---

## Recommended Implementation Direction

Use this plan shape:

1. **Artifact and route extension**
   - extend smoke schema with packaged mode, screenshots, log excerpts, and blocker findings
2. **Packaged helper seam**
   - add scripts/helpers to launch and observe `win-unpacked`
   - add installer-run helper for NSIS evidence collection
3. **Packaged evidence generation**
   - generate JSON + Markdown from one artifact
   - attach screenshots/log excerpts
4. **Packaged release gate policy**
   - encode blocker vs warning in data and docs

This is the best tradeoff between confidence and effort for the current milestone.

Confidence: **high**

---

## Source Notes

Primary sources used:
- local repo configuration and implementation:
  - [package.json](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/package.json)
  - [electron/main.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/electron/main.ts)
  - [build/installer.nsh](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/build/installer.nsh)
  - [script/desktop-smoke.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/script/desktop-smoke.ts)
- official docs:
  - [electron-builder NSIS docs](https://www.electron.build/nsis.html)
  - [electron-builder Windows target docs](https://www.electron.build/win.html)
  - [Electron app docs](https://www.electronjs.org/docs/latest/api/app)
  - [Electron BrowserWindow docs](https://www.electronjs.org/docs/latest/api/browser-window)
