import { app, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdir, readFile, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";
import {
  DB_MANAGEMENT_EXTENSION_ID,
  OFFICIAL_DB_MANAGEMENT_EXTENSION,
  OFFICIAL_EXTENSION_RELEASES_URL,
  type ExtensionCatalogRelease,
  type ExtensionId,
  type ExtensionLifecycleState,
} from "@shared/schema";
import { storage } from "../server/storage";
import {
  downloadFileWithProgress,
  fetchOfficialExtensionCatalog,
  sha256File,
} from "./github-release";

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

export interface ExtensionInstallContext {
  extensionId: ExtensionId;
  extensionsRoot: string;
  installRoot: string;
  releasesUrl: string;
}

export interface ExtensionActivationResult {
  accepted: boolean;
  restartRequired: boolean;
}

type LifecycleInput = Omit<ExtensionLifecycleState, "id" | "updatedAt">;

function nowIso(): string {
  return new Date().toISOString();
}

function parseCheckedAt(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function toLifecycleInput(state?: ExtensionLifecycleState): LifecycleInput {
  return {
    extensionId: state?.extensionId ?? DB_MANAGEMENT_EXTENSION_ID,
    stage: state?.stage ?? "idle",
    progressPercent: state?.progressPercent ?? 0,
    downloadedBytes: state?.downloadedBytes ?? 0,
    totalBytes: state?.totalBytes,
    availableVersion: state?.availableVersion,
    releaseTag: state?.releaseTag,
    assetName: state?.assetName,
    assetUrl: state?.assetUrl,
    downloadPath: state?.downloadPath,
    stagedPath: state?.stagedPath,
    activeVersion: state?.activeVersion,
    previousVersion: state?.previousVersion,
    catalogJson: state?.catalogJson,
    lastErrorCode: state?.lastErrorCode,
    lastErrorMessage: state?.lastErrorMessage,
    lastCheckedAt: state?.lastCheckedAt,
  };
}

async function extractZipArchive(zipPath: string, destinationPath: string): Promise<void> {
  await rm(destinationPath, { recursive: true, force: true });
  await mkdir(destinationPath, { recursive: true });

  const literalZipPath = zipPath.replace(/'/g, "''");
  const literalDestinationPath = destinationPath.replace(/'/g, "''");
  const command = `Expand-Archive -LiteralPath '${literalZipPath}' -DestinationPath '${literalDestinationPath}' -Force`;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Failed to extract extension archive (exit ${code ?? "unknown"})`));
    });
  });
}

function calculateProgress(downloadedBytes: number, totalBytes?: number): number {
  if (!totalBytes || totalBytes <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
}

export class ElectronExtensionService {
  private readonly activeOperations = new Map<ExtensionId, Promise<void>>();

  getExtensionsRoot(): string {
    const root = path.join(app.getPath("userData"), "extensions");
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  getInstallRoot(extensionId: ExtensionId): string {
    return path.join(this.getExtensionsRoot(), extensionId);
  }

  getInstallContext(extensionId: ExtensionId): ExtensionInstallContext {
    if (extensionId !== DB_MANAGEMENT_EXTENSION_ID) {
      throw new Error(`Unknown extension id: ${extensionId}`);
    }

    return {
      extensionId,
      extensionsRoot: this.getExtensionsRoot(),
      installRoot: this.getInstallRoot(extensionId),
      releasesUrl: OFFICIAL_EXTENSION_RELEASES_URL,
    };
  }

  private getDownloadsRoot(extensionId: ExtensionId): string {
    return path.join(this.getInstallRoot(extensionId), "downloads");
  }

  private getVersionsRoot(extensionId: ExtensionId): string {
    return path.join(this.getInstallRoot(extensionId), "versions");
  }

  private async readLifecycleState(extensionId: ExtensionId): Promise<ExtensionLifecycleState | undefined> {
    return await storage.getExtensionLifecycleState(extensionId);
  }

  private async writeLifecycleState(
    extensionId: ExtensionId,
    patch: Partial<LifecycleInput>,
  ): Promise<ExtensionLifecycleState> {
    const current = await this.readLifecycleState(extensionId);
    const next: LifecycleInput = {
      ...toLifecycleInput(current),
      extensionId,
      ...patch,
    };
    return await storage.upsertExtensionLifecycleState(next);
  }

  async openInstallFlow(extensionId: ExtensionId): Promise<ExtensionInstallContext> {
    const context = this.getInstallContext(extensionId);
    await shell.openExternal(context.releasesUrl);
    return context;
  }

  async getCatalog(extensionId: ExtensionId, force = false): Promise<ExtensionCatalogRelease | null> {
    const lifecycle = await this.readLifecycleState(extensionId);
    const checkedAt = parseCheckedAt(lifecycle?.lastCheckedAt);
    const cachedRelease =
      lifecycle?.catalogJson && !force
        ? (() => {
            try {
              return JSON.parse(lifecycle.catalogJson) as ExtensionCatalogRelease;
            } catch {
              return null;
            }
          })()
        : null;

    if (
      cachedRelease &&
      checkedAt &&
      Date.now() - checkedAt < CATALOG_CACHE_TTL_MS
    ) {
      return cachedRelease;
    }

    await this.writeLifecycleState(extensionId, {
      stage: "checking",
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
    });

    try {
      const resolved = await fetchOfficialExtensionCatalog(extensionId);
      await this.writeLifecycleState(extensionId, {
        stage: "available",
        availableVersion: resolved.release.version,
        releaseTag: resolved.release.tagName,
        assetName: resolved.release.package?.assetName,
        assetUrl: resolved.release.package?.downloadUrl,
        catalogJson: JSON.stringify(resolved.release),
        lastCheckedAt: resolved.release.checkedAt ?? nowIso(),
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      });
      return resolved.release;
    } catch (error) {
      await this.writeLifecycleState(extensionId, {
        stage: "failed",
        lastErrorCode: "catalog_unavailable",
        lastErrorMessage: error instanceof Error ? error.message : "Failed to load official extension catalog.",
        lastCheckedAt: nowIso(),
      });
      throw error;
    }
  }

  async getLifecycleState(extensionId: ExtensionId): Promise<ExtensionLifecycleState | null> {
    return (await this.readLifecycleState(extensionId)) ?? null;
  }

  async startInstall(extensionId: ExtensionId): Promise<ExtensionLifecycleState> {
    const running = this.activeOperations.get(extensionId);
    if (!running) {
      const operation = this.runInstall(extensionId).finally(() => {
        this.activeOperations.delete(extensionId);
      });
      this.activeOperations.set(extensionId, operation);
    }

    return (
      (await this.readLifecycleState(extensionId)) ??
      (await this.writeLifecycleState(extensionId, {
        stage: "checking",
        progressPercent: 0,
        downloadedBytes: 0,
      }))
    );
  }

  async uninstallExtension(extensionId: ExtensionId): Promise<ExtensionLifecycleState> {
    await this.writeLifecycleState(extensionId, {
      stage: "uninstalling",
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
    });

    try {
      const installed = await storage.getInstalledExtension(extensionId);
      if (installed?.installPath) {
        await rm(installed.installPath, { recursive: true, force: true });
      }
      await rm(this.getInstallRoot(extensionId), { recursive: true, force: true });
      await storage.deleteExtensionLifecycleState(extensionId);
      await storage.setInstalledExtensionEnabled(extensionId, false);
      return await this.writeLifecycleState(extensionId, {
        stage: "idle",
        progressPercent: 0,
        downloadedBytes: 0,
        totalBytes: undefined,
        availableVersion: undefined,
        releaseTag: undefined,
        assetName: undefined,
        assetUrl: undefined,
        downloadPath: undefined,
        stagedPath: undefined,
        activeVersion: undefined,
        previousVersion: installed?.version,
        catalogJson: undefined,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
        lastCheckedAt: undefined,
      });
    } catch (error) {
      return await this.writeLifecycleState(extensionId, {
        stage: "failed",
        lastErrorCode: "uninstall_failed",
        lastErrorMessage: error instanceof Error ? error.message : "Failed to uninstall extension.",
      });
    }
  }

  async activateExtension(_extensionId: ExtensionId): Promise<ExtensionActivationResult> {
    setImmediate(() => {
      app.relaunch();
      app.quit();
    });

    return {
      accepted: true,
      restartRequired: true,
    };
  }

  private async runInstall(extensionId: ExtensionId): Promise<void> {
    try {
      const release = await this.getCatalog(extensionId, true);
      if (!release?.package) {
        await this.writeLifecycleState(extensionId, {
          stage: "failed",
          lastErrorCode: release?.compatibilityStatus === "incompatible" ? "incompatible" : "asset_not_found",
          lastErrorMessage: release?.compatibilityMessage ?? "No install package is available for this platform.",
        });
        return;
      }

      const downloadsRoot = this.getDownloadsRoot(extensionId);
      const versionsRoot = this.getVersionsRoot(extensionId);
      const archivePath = path.join(downloadsRoot, `${release.version}.zip`);
      const tempExtractPath = path.join(versionsRoot, `.staging-${release.version}`);
      const finalInstallPath = path.join(versionsRoot, release.version);

      await mkdir(downloadsRoot, { recursive: true });
      await mkdir(versionsRoot, { recursive: true });

      await this.writeLifecycleState(extensionId, {
        stage: "downloading",
        progressPercent: 0,
        downloadedBytes: 0,
        totalBytes: release.package.size,
        availableVersion: release.version,
        assetName: release.package.assetName,
        assetUrl: release.package.downloadUrl,
        downloadPath: archivePath,
        stagedPath: tempExtractPath,
      });

      await downloadFileWithProgress(release.package.downloadUrl, archivePath, async (downloadedBytes, totalBytes) => {
        await this.writeLifecycleState(extensionId, {
          stage: "downloading",
          progressPercent: calculateProgress(downloadedBytes, totalBytes ?? release.package?.size),
          downloadedBytes,
          totalBytes: totalBytes ?? release.package?.size,
          downloadPath: archivePath,
        });
      });

      await this.writeLifecycleState(extensionId, {
        stage: "verifying",
        progressPercent: 100,
        downloadedBytes: release.package.size ?? 0,
        totalBytes: release.package.size,
      });

      const actualChecksum = await sha256File(archivePath);
      if (actualChecksum.toLowerCase() !== release.package.sha256.toLowerCase()) {
        await this.writeLifecycleState(extensionId, {
          stage: "failed",
          lastErrorCode: "verification_failed",
          lastErrorMessage: "Downloaded extension checksum did not match the official manifest.",
        });
        await unlink(archivePath).catch(() => undefined);
        return;
      }

      await this.writeLifecycleState(extensionId, {
        stage: "installing",
      });

      await extractZipArchive(archivePath, tempExtractPath);
      await rm(finalInstallPath, { recursive: true, force: true });
      await rename(tempExtractPath, finalInstallPath);

      const manifestJson = await readFile(path.join(finalInstallPath, "manifest.json"), "utf8").catch(() => "");
      const installed = await storage.getInstalledExtension(extensionId);
      await storage.upsertInstalledExtension({
        extensionId,
        version: release.version,
        enabled: true,
        installPath: finalInstallPath,
        manifestJson: manifestJson || undefined,
        minAppVersion: OFFICIAL_DB_MANAGEMENT_EXTENSION.minAppVersion,
        hostApiVersion: OFFICIAL_DB_MANAGEMENT_EXTENSION.hostApiVersion,
        compatibilityStatus: release.compatibilityStatus,
        compatibilityMessage: release.compatibilityMessage,
      });

      await this.writeLifecycleState(extensionId, {
        stage: "ready_to_enable",
        progressPercent: 100,
        downloadedBytes: release.package.size ?? 0,
        totalBytes: release.package.size,
        availableVersion: release.version,
        activeVersion: release.version,
        previousVersion: installed?.version,
        downloadPath: archivePath,
        stagedPath: finalInstallPath,
        catalogJson: JSON.stringify(release),
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      });
    } catch (error) {
      await this.writeLifecycleState(extensionId, {
        stage: "failed",
        lastErrorCode: "install_failed",
        lastErrorMessage: error instanceof Error ? error.message : "Failed to install official extension.",
      });
    }
  }
}

export const extensionService = new ElectronExtensionService();
