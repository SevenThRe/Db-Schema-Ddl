import {
  EXTENSION_HOST_API_VERSION,
  OFFICIAL_DB_MANAGEMENT_EXTENSION,
  type ExtensionCatalogRelease,
  type ExtensionHostAction,
  type ExtensionHostState,
  type ExtensionId,
  type ExtensionLifecycleState,
  type InstalledExtensionRecord,
} from "@shared/schema";
import { storage } from "../../storage";

const VERSION_PART_DELIMITER = ".";

function resolveCurrentAppVersion(): string {
  const raw = process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.0.0";
  return String(raw).trim() || "0.0.0";
}

function parseVersionParts(version: string): number[] {
  return version
    .split(VERSION_PART_DELIMITER)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }
  return 0;
}

function resolveInstalledCompatibility(
  extension: InstalledExtensionRecord,
  appVersion: string,
): { compatible: boolean; message?: string } {
  if (extension.compatibilityStatus === "incompatible") {
    return {
      compatible: false,
      message: extension.compatibilityMessage ?? "当前扩展版本与主程序不兼容。",
    };
  }

  if (extension.hostApiVersion !== EXTENSION_HOST_API_VERSION) {
    return {
      compatible: false,
      message: `扩展宿主 API 版本不匹配（需要 ${extension.hostApiVersion}，当前 ${EXTENSION_HOST_API_VERSION}）。`,
    };
  }

  if (extension.minAppVersion && compareVersions(appVersion, extension.minAppVersion) < 0) {
    return {
      compatible: false,
      message: `需要主程序 ${extension.minAppVersion} 或更高版本。`,
    };
  }

  return {
    compatible: true,
    message: extension.compatibilityMessage,
  };
}

function buildActions(status: ExtensionHostState["status"]): ExtensionHostAction[] {
  switch (status) {
    case "not_installed":
      return ["install", "check_for_updates"];
    case "disabled":
      return ["enable", "activate", "check_for_updates", "uninstall"];
    case "incompatible":
      return ["install", "check_for_updates"];
    case "enabled":
      return ["disable", "activate", "check_for_updates", "uninstall"];
    default:
      return [];
  }
}

function parseCatalog(catalogJson?: string): ExtensionCatalogRelease | undefined {
  if (!catalogJson) {
    return undefined;
  }
  try {
    return JSON.parse(catalogJson) as ExtensionCatalogRelease;
  } catch {
    return undefined;
  }
}

function resolveUpdateAvailability(
  installed?: InstalledExtensionRecord,
  lifecycle?: ExtensionLifecycleState,
): { updateAvailable: boolean; updateVersion?: string } {
  if (!installed || !lifecycle?.availableVersion) {
    return { updateAvailable: false };
  }
  const updateAvailable = compareVersions(lifecycle.availableVersion, installed.version) > 0;
  return {
    updateAvailable,
    updateVersion: updateAvailable ? lifecycle.availableVersion : undefined,
  };
}

export function resolveExtensionState(
  extensionId: ExtensionId,
  installed?: InstalledExtensionRecord,
  lifecycle?: ExtensionLifecycleState,
  appVersion = resolveCurrentAppVersion(),
): ExtensionHostState {
  if (extensionId !== OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId) {
    throw new Error(`Unknown extension id: ${extensionId}`);
  }

  const catalog = parseCatalog(lifecycle?.catalogJson);
  const updateInfo = resolveUpdateAvailability(installed, lifecycle);

  if (!installed) {
    const status = lifecycle?.lastErrorCode === "incompatible" ? "incompatible" : "not_installed";
    const availableActions = buildActions(status);
    if (lifecycle?.stage === "failed") {
      availableActions.push("retry");
    }
    return {
      ...OFFICIAL_DB_MANAGEMENT_EXTENSION,
      status,
      enabled: false,
      installedVersion: undefined,
      installPath: undefined,
      compatibilityStatus: catalog?.compatibilityStatus ?? "unknown",
      compatibilityMessage: lifecycle?.lastErrorMessage ?? catalog?.compatibilityMessage,
      requiresAppRestart: false,
      availableActions,
      installMarkerLabel: "扩展",
      stateLabel: status === "incompatible" ? "需要更新" : "未安装",
      updateAvailable: false,
      updateVersion: undefined,
      catalog,
      lifecycle,
    };
  }

  const compatibility = resolveInstalledCompatibility(installed, appVersion);
  const status = !compatibility.compatible
    ? "incompatible"
    : installed.enabled
      ? "enabled"
      : "disabled";
  const availableActions = buildActions(status);
  if (updateInfo.updateAvailable) {
    availableActions.push("update");
  }
  if (lifecycle?.stage === "failed") {
    availableActions.push("retry");
  }

  return {
    ...OFFICIAL_DB_MANAGEMENT_EXTENSION,
    status,
    enabled: status === "enabled",
    installedVersion: installed.version,
    installPath: installed.installPath,
    minAppVersion: installed.minAppVersion ?? OFFICIAL_DB_MANAGEMENT_EXTENSION.minAppVersion,
    compatibilityStatus: compatibility.compatible ? "compatible" : "incompatible",
    compatibilityMessage: compatibility.message,
    requiresAppRestart:
      status === "disabled" ||
      status === "enabled" ||
      lifecycle?.stage === "ready_to_enable",
    availableActions,
    installMarkerLabel: undefined,
    stateLabel:
      status === "enabled"
        ? "已启用"
        : status === "disabled"
          ? "已禁用"
          : status === "incompatible"
            ? "需要更新"
            : "未安装",
    updateAvailable: updateInfo.updateAvailable,
    updateVersion: updateInfo.updateVersion,
    catalog,
    lifecycle,
  };
}

export async function listKnownExtensions(): Promise<ExtensionHostState[]> {
  const appVersion = resolveCurrentAppVersion();
  const installed = await storage.listInstalledExtensions();
  const lifecycles = await storage.listExtensionLifecycleStates();
  const installedById = new Map(installed.map((item) => [item.extensionId, item]));
  const lifecycleById = new Map(lifecycles.map((item) => [item.extensionId, item]));
  return [
    resolveExtensionState(
      OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId,
      installedById.get(OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId),
      lifecycleById.get(OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId),
      appVersion,
    ),
  ];
}

export async function getKnownExtension(extensionId: ExtensionId): Promise<ExtensionHostState | undefined> {
  if (extensionId !== OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId) {
    return undefined;
  }
  const installed = await storage.getInstalledExtension(extensionId);
  const lifecycle = await storage.getExtensionLifecycleState(extensionId);
  return resolveExtensionState(extensionId, installed, lifecycle);
}

export async function setExtensionEnabled(
  extensionId: ExtensionId,
  enabled: boolean,
): Promise<ExtensionHostState | undefined> {
  const updated = await storage.setInstalledExtensionEnabled(extensionId, enabled);
  if (!updated) {
    return undefined;
  }
  const lifecycle = await storage.getExtensionLifecycleState(extensionId);
  return resolveExtensionState(extensionId, updated, lifecycle);
}

export async function getKnownExtensionCatalog(
  extensionId: ExtensionId,
): Promise<ExtensionCatalogRelease | null | undefined> {
  if (extensionId !== OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId) {
    return undefined;
  }
  const lifecycle = await storage.getExtensionLifecycleState(extensionId);
  return parseCatalog(lifecycle?.catalogJson) ?? null;
}

export async function getKnownExtensionLifecycle(
  extensionId: ExtensionId,
): Promise<ExtensionLifecycleState | undefined> {
  if (extensionId !== OFFICIAL_DB_MANAGEMENT_EXTENSION.extensionId) {
    return undefined;
  }
  return await storage.getExtensionLifecycleState(extensionId);
}
