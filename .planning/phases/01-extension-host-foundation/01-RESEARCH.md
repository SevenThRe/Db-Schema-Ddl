# Phase 1: Extension Host Foundation - Research

**Researched:** 2026-03-17
**Domain:** Electron desktop extension host for an official GitHub-delivered module
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- The `DB 管理` entry should always be visible in the left sidebar.
- It should be treated as a module-level entry, not as a worksheet-related view mode like `Preview` or `Diff`.
- The extension entry should remain present regardless of installation state so users always know the capability exists.
- When the extension is not installed, the sidebar entry should appear greyed out.
- The entry should include a small download/extension marker so it reads as "available to install" rather than simply "disabled."
- Clicking the greyed-out entry should open a concise confirmation modal prompting the user to download the extension.
- The first interaction should be a simple confirmation modal, not a detailed information panel.
- After installation completes, the app should offer `立即启用`.
- The implementation can use an app restart or reload behind that action; user-facing behavior should feel like a direct enable step rather than a manual restart flow.
- The DB management capability should be presented as an `官方扩展`.
- v1 should only allow downloading and enabling the official extension from the author's GitHub release source.
- If the extension is installed but disabled, keep the sidebar entry visible with an `已禁用` style/marker and allow the user to re-enable it from a lightweight status prompt.
- If the extension is installed but incompatible, show the sidebar entry in a disabled/grey state with a `需要更新` marker and prompt the user to update either the app or the extension.

### Claude's Discretion
- Exact badge/icon wording for the sidebar marker
- Exact modal copy, as long as it stays concise
- Whether `立即启用` performs a full app relaunch or a controlled in-app reload
- Exact visual treatment for disabled versus incompatible states, as long as the status remains obvious

### Deferred Ideas (OUT OF SCOPE)
- None - discussion stayed within phase scope

</user_constraints>

<research_summary>
## Summary

For this phase, the established architecture is a manifest-driven extension host that keeps trust and activation centralized in the core Electron app. The host should treat the downloaded DB capability as an installable artifact with metadata, compatibility rules, checksum verification, versioned install directories, and a restart/reload-based activation boundary. That pattern aligns with the existing codebase, which already relies on Electron bootstrap, a local Express server, preload-scoped IPC, and GitHub Releases for app updates.

The best-fit implementation for this repository is not "live plugin hot loading." It is a first-party extension registry persisted in local storage, a GitHub release catalog lookup, a download-and-verify install flow, and a controlled relaunch path for enablement. This keeps the base app stable, matches the user's desired UX, and avoids brittle runtime mutation of the already-running server/UI bundle.

**Primary recommendation:** Build Phase 1 around a signed-by-policy manifest, SQLite-backed extension state, GitHub release asset download plus digest verification, versioned install directories under `userData`, and activation by Electron relaunch/reload rather than runtime hot-plugging.
</research_summary>

<standard_stack>
## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 34.0.0 | Desktop host lifecycle, app relaunch, preload bridge | Already the app shell and the right layer for extension activation |
| react | 18.3.1 | Host UI state and sidebar/status rendering | Already the base UI framework |
| zod | 3.24.2 | Manifest, catalog, and lifecycle API validation | Already the contract system used across this repo |
| better-sqlite3 | 12.6.2 | Persist installed extension state, compatibility, and activation metadata | Already the desktop persistence backbone |
| node:crypto | built-in | SHA-256 verification for downloaded artifacts | Official, built-in, avoids extra integrity libraries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| semver | 7.7.4 | App-extension compatibility checks | Use for manifest `minAppVersion` and range matching |
| extract-zip | 2.0.1 | Safe ZIP extraction into versioned install dirs | Use instead of hand-rolled unzip logic |
| electron-updater | 6.7.3 | UX reference for confirm/download/progress/install flow | Reuse interaction patterns, not the updater itself, for extension delivery |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `extract-zip` | `adm-zip` 0.5.16 | `adm-zip` is simple but tends toward in-memory manipulation; `extract-zip` better fits file-based install flows |
| Relaunch/reload activation | Runtime hot-load of routes/UI | Hot-load offers nicer UX but is much riskier in this codebase |
| SQLite-backed extension state | JSON file-only registry | JSON is simpler at first, but SQLite better matches the existing state and lifecycle model |

**Installation:**
```bash
npm install semver extract-zip
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure
```text
electron/
  extension-host.ts        # download/install/enable/disable/relaunch orchestration
  preload.ts               # narrow extension lifecycle IPC
server/
  routes/extensions.ts     # extension catalog/status/lifecycle routes
  lib/extensions/          # manifest validation, registry, installer, compatibility
shared/
  extension-schema.ts      # manifest/status/catalog Zod schemas
  extension-routes.ts      # typed host API contract
client/src/
  components/extensions/   # sidebar state, install modal, status UI
  hooks/use-extensions.ts  # typed extension host hooks
```

### Pattern 1: Manifest-driven extension registry
**What:** Treat each installed extension as a validated manifest plus runtime state record, rather than as an opaque folder drop.
**When to use:** Always for first-party downloadable modules in this app.
**Example:**
```typescript
import { z } from "zod";

export const extensionManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  publisher: z.literal("SevenThRe"),
  minAppVersion: z.string().min(1),
  platform: z.enum(["win32-x64"]),
  entry: z.object({
    server: z.string().min(1),
    web: z.string().min(1),
  }),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
```

### Pattern 2: Narrow preload IPC for lifecycle actions
**What:** Expose one method per extension-host action instead of a generic IPC send surface.
**When to use:** For install, enable, disable, relaunch, and status-check actions.
**Example:**
```typescript
// Source pattern: Electron context isolation docs
contextBridge.exposeInMainWorld("extensionAPI", {
  checkCatalog: () => ipcRenderer.invoke("extensions:check-catalog"),
  install: (id: string) => ipcRenderer.invoke("extensions:install", { id }),
  enable: (id: string) => ipcRenderer.invoke("extensions:enable", { id }),
  relaunchForActivation: () => ipcRenderer.invoke("extensions:relaunch"),
});
```

### Pattern 3: Versioned install directories plus atomic activation
**What:** Download into a temp path, verify digest, extract into a versioned directory under `userData`, then flip active state only after the install is complete.
**When to use:** Every install or upgrade path.
**Example:**
```typescript
const installRoot = path.join(app.getPath("userData"), "extensions", manifest.id);
const versionDir = path.join(installRoot, manifest.version);
const tempZip = path.join(installRoot, `${manifest.version}.zip.tmp`);

// download -> verify hash -> extract -> mark enabled -> relaunch
```

### Anti-Patterns to Avoid
- **Runtime hot-loading of server routes into an already-running bundled server:** much higher complexity and failure surface than relaunch-based activation
- **Generic "send any IPC message" bridges:** Electron explicitly recommends narrow, purpose-built APIs under context isolation
- **Installing downloaded assets into packaged app resources:** packaged app contents are the wrong place for mutable extension artifacts; use `userData`
- **Treating catalog JSON as trusted without schema validation:** the host must validate every external payload before acting on it
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| App-version compatibility | Custom semver string parsing | `semver` | Range parsing and prerelease edge cases are easy to get wrong |
| ZIP extraction | Manual unzip/extract logic | `extract-zip` | File permissions, nested paths, and traversal handling are not worth re-implementing |
| Download integrity | Home-grown checksum format rules | GitHub release asset digest plus `node:crypto` verification | GitHub now exposes asset digests and Node already provides standard hashing |
| Electron host bridge | Generic IPC bus | `contextBridge` with one action per method | Official Electron guidance favors narrow, auditable surfaces |

**Key insight:** This phase should hand-roll only the host-specific orchestration and manifest semantics. Version parsing, ZIP extraction, hashing, and IPC exposure all have established building blocks already.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Trying to make install "instant" by hot-loading everything
**What goes wrong:** The base app ends up with partially loaded UI or server state, requiring awkward recovery paths.
**Why it happens:** Hot-loading sounds user-friendly but fights the current Electron + local Express startup model.
**How to avoid:** Make installation finish in the background, then activate through a controlled relaunch/reload path.
**Warning signs:** Mid-session state mismatches, routes only partly available, multiple reload hacks.

### Pitfall 2: Exposing too much IPC surface to the renderer
**What goes wrong:** The renderer can invoke arbitrary privileged behavior or future maintenance becomes opaque.
**Why it happens:** It is tempting to expose `ipcRenderer.send` directly or make one catch-all extension channel.
**How to avoid:** Keep IPC narrow and action-specific; validate every payload with Zod before acting.
**Warning signs:** Preload bridges that forward raw `ipcRenderer`, weak payload typing, or many stringly-typed action names.

### Pitfall 3: Non-atomic install/upgrade state
**What goes wrong:** The UI thinks an extension is installed even though extraction or verification failed halfway through.
**Why it happens:** State gets updated before verification and extraction fully complete.
**How to avoid:** Track install status transitions explicitly: `not_installed -> downloading -> verifying -> extracted -> enabled`.
**Warning signs:** Enabled entries with missing files, upgrade crashes, or reinstall required after partial failure.

### Pitfall 4: Installing into the wrong directory
**What goes wrong:** Packaged app updates wipe extension assets or the app cannot modify its own files safely.
**Why it happens:** Install code uses app resources or working directory instead of `userData`.
**How to avoid:** Always install mutable extension artifacts beneath `app.getPath("userData")`.
**Warning signs:** Paths inside `app.asar`, `resources`, or repo-root-only assumptions.
</common_pitfalls>

<code_examples>
## Code Examples

Verified patterns from official sources:

### Controlled relaunch after activation
```typescript
// Source: https://www.electronjs.org/docs/latest/api/app
import { app } from "electron";

function relaunchForExtensionActivation() {
  app.relaunch();
  app.exit(0);
}
```

### Narrow contextBridge exposure
```typescript
// Source: https://www.electronjs.org/docs/latest/tutorial/context-isolation
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("extensionAPI", {
  install: (id) => ipcRenderer.invoke("extensions:install", { id }),
  enable: (id) => ipcRenderer.invoke("extensions:enable", { id }),
});
```

### SHA-256 verification of a downloaded asset
```typescript
// Source: https://nodejs.org/api/crypto.html#createhashalgorithm-options
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function sha256File(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}
```

### Reading release assets from GitHub metadata
```typescript
// Source: https://docs.github.com/en/rest/releases/assets
const release = await fetch("https://api.github.com/repos/OWNER/REPO/releases/latest").then((r) => r.json());
const asset = release.assets.find((item) => item.name === "db-management-extension-win-x64.zip");
// use asset.browser_download_url and asset.digest when available
```
</code_examples>

## Validation Architecture

Use a validation strategy that samples both host correctness and UX-state correctness:

- Contract validation:
  - Zod validation for catalog payloads, manifests, and extension status API responses
  - Reject unknown publishers, invalid versions, and malformed entry points before install begins
- Install integrity:
  - Test download -> verify -> extract -> enable transitions separately
  - Ensure state does not advance if digest verification fails
- Activation safety:
  - Smoke-test relaunch/reload entry after install
  - Verify base app still launches normally with no extension installed
- UI-state coverage:
  - Explicitly verify the four user-visible states:
    - not installed
    - installed and enabled
    - installed but disabled
    - incompatible / needs update
- Regression guard:
  - Keep a non-extension test path in the suite so Phase 1 cannot break existing Excel/DDL flows

<sota_updates>
## State of the Art (2024-2025)

What's changed recently:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Treating GitHub releases as download URLs only | Use release asset metadata, including digest when available | 2025-06 | Makes first-party artifact verification easier to standardize |
| Broad renderer access to Electron internals | Context-isolated preload with narrow APIs | Electron 12+ and still current | Stronger default desktop security posture |
| Plugin hot-load as a default UX goal | Controlled reload/relaunch for privileged desktop modules | Current standard in Electron desktop tooling | More reliable than mutating a running privileged host |

**New tools/patterns to consider:**
- GitHub release asset digests: useful for first-party extension verification
- Versioned install roots under `userData`: makes rollback and compatibility handling much cleaner

**Deprecated/outdated:**
- Exposing raw `ipcRenderer` or generic send bridges to the renderer
- Writing mutable runtime artifacts into packaged application resources
</sota_updates>

<open_questions>
## Open Questions

1. **What exact extension manifest fields are truly required in v1?**
   - What we know: `id`, `version`, `publisher`, `minAppVersion`, entry points, and digest are enough to unlock Phase 1
   - What's unclear: whether permissions and per-platform variants need to be v1-hard requirements
   - Recommendation: keep v1 manifest minimal but explicit; permissions can be declared even if only informational at first

2. **Should activation be a full app relaunch or a lighter in-app reload?**
   - What we know: a controlled restart/reload is preferred over hot-loading
   - What's unclear: whether the existing Electron bootstrap can support a clean in-app reload without a full relaunch
   - Recommendation: plan for a full relaunch first; treat lighter reload as an implementation optimization

3. **Should extension host state live in existing shared storage tables or a small dedicated registry file?**
   - What we know: SQLite is already the desktop source of truth for app state
   - What's unclear: whether bootstrapping extension install state before DB init matters for startup sequencing
   - Recommendation: default to shared SQLite tables unless startup ordering proves it painful
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- https://www.electronjs.org/docs/latest/api/app - checked `app.relaunch()` behavior and `app.getPath("userData")` guidance
- https://www.electronjs.org/docs/latest/tutorial/context-isolation - checked secure preload and `contextBridge` usage
- https://docs.github.com/en/rest/releases/assets - checked release asset metadata and download fields
- https://github.blog/changelog/2025-06-03-releases-now-expose-digests-for-more-assets/ - checked current GitHub digest support for release assets
- https://nodejs.org/api/crypto.html#createhashalgorithm-options - checked built-in SHA hashing support
- Local codebase:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `electron/updater.ts`
  - `client/src/pages/Dashboard.tsx`
  - `shared/schema.ts`
  - `server/storage.ts`

### Secondary (MEDIUM confidence)
- `npm view semver version` - version check for `semver`
- `npm view extract-zip version` - version check for `extract-zip`
- `npm view adm-zip version` - version check for alternative comparison

### Tertiary (LOW confidence - needs validation)
- None - core claims are tied to official docs or the current repository
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Electron extension host and first-party artifact delivery
- Ecosystem: manifest validation, ZIP extraction, compatibility checking, preload IPC
- Patterns: manifest registry, versioned install dirs, relaunch activation
- Pitfalls: hot-load complexity, insecure IPC, partial installs, wrong install path

**Confidence breakdown:**
- Standard stack: HIGH - mostly existing stack plus small supporting libraries with current version checks
- Architecture: HIGH - grounded in official Electron security/lifecycle docs and current codebase shape
- Pitfalls: HIGH - directly implied by Electron process boundaries and mutable artifact handling
- Code examples: HIGH - from official Electron/GitHub/Node documentation patterns

**Research date:** 2026-03-17
**Valid until:** 2026-04-16
</metadata>

---

*Phase: 01-extension-host-foundation*
*Research completed: 2026-03-17*
*Ready for planning: yes*
