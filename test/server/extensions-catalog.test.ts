import test from "node:test";
import assert from "node:assert/strict";
import {
  type ExtensionLifecycleState,
  OFFICIAL_DB_MANAGEMENT_EXTENSION,
} from "../../shared/schema";
import { resolveExtensionState } from "../../server/lib/extensions/registry";

function createLifecycleState(overrides: Partial<ExtensionLifecycleState> = {}): ExtensionLifecycleState {
  return {
    id: 1,
    extensionId: OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId,
    stage: "available",
    progressPercent: 0,
    downloadedBytes: 0,
    totalBytes: 12,
    availableVersion: "1.2.0",
    releaseTag: "v1.2.0",
    assetName: "db-management-extension-win-x64.zip",
    assetUrl: "https://example.com/db-management-extension-win-x64.zip",
    downloadPath: undefined,
    stagedPath: undefined,
    activeVersion: undefined,
    previousVersion: undefined,
    catalogJson: JSON.stringify({
      version: "1.2.0",
      tagName: "v1.2.0",
      summary: "Adds the compact install panel",
      releaseNotes: "More reliable install flow",
      releaseUrl: "https://example.com/releases/v1.2.0",
      package: {
        target: "win32-x64",
        assetName: "db-management-extension-win-x64.zip",
        downloadUrl: "https://example.com/db-management-extension-win-x64.zip",
        size: 12,
        sha256: "0123456789abcdef0123456789abcdef",
      },
      compatibilityStatus: "compatible",
      checkedAt: "2026-03-17T00:00:00.000Z",
    }),
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
    lastCheckedAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
    ...overrides,
  };
}

test("resolveExtensionState surfaces catalog metadata for absent official extension", () => {
  const state = resolveExtensionState(
    OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId,
    undefined,
    createLifecycleState(),
    "1.1.4",
  );

  assert.equal(state.status, "not_installed");
  assert.equal(state.catalog?.version, "1.2.0");
  assert.equal(state.catalog?.summary, "Adds the compact install panel");
  assert.ok(state.availableActions.includes("install"));
  assert.ok(state.availableActions.includes("check_for_updates"));
});

test("resolveExtensionState flags update availability and retry guidance for installed extension", () => {
  const state = resolveExtensionState(
    OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId,
    {
      id: 99,
      extensionId: OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId,
      version: "1.0.0",
      enabled: true,
      installPath: "C:/extensions/db-management/versions/1.0.0",
      manifestJson: "{}",
      minAppVersion: "1.0.0",
      hostApiVersion: 1,
      compatibilityStatus: "compatible",
      compatibilityMessage: undefined,
      installedAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
    },
    createLifecycleState({
      stage: "failed",
      lastErrorCode: "install_failed",
      lastErrorMessage: "The archive could not be extracted.",
    }),
    "1.1.4",
  );

  assert.equal(state.status, "enabled");
  assert.equal(state.updateAvailable, true);
  assert.equal(state.updateVersion, "1.2.0");
  assert.ok(state.availableActions.includes("update"));
  assert.ok(state.availableActions.includes("retry"));
  assert.equal(state.lifecycle?.lastErrorMessage, "The archive could not be extracted.");
});
