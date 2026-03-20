export type DesktopRuntime = "web" | "electron" | "tauri";

export interface DesktopFeatureFlags {
  updater: boolean;
  extensions: boolean;
  dbManagement: boolean;
  ddlImport: boolean;
  nameFix: boolean;
  schemaDiff: boolean;
}

export interface DesktopCapabilities {
  runtime: DesktopRuntime;
  features: DesktopFeatureFlags;
}

function detectRuntime(): DesktopRuntime {
  if (typeof window === "undefined") {
    return "web";
  }

  const tauriGlobal = globalThis as typeof globalThis & {
    isTauri?: boolean;
  };

  if (tauriGlobal.isTauri || window.__TAURI__ || window.__TAURI_INTERNALS__) {
    return "tauri";
  }
  if (window.electronAPI) {
    return "electron";
  }
  return "web";
}

export function getDesktopCapabilities(): DesktopCapabilities {
  const runtime = detectRuntime();

  if (runtime === "tauri") {
    return {
      runtime,
      features: {
        updater: false,
        extensions: false,
        dbManagement: false,
        ddlImport: false,
        nameFix: false,
        schemaDiff: false,
      },
    };
  }

  if (runtime === "electron") {
    return {
      runtime,
      features: {
        updater: true,
        extensions: true,
        dbManagement: true,
        ddlImport: true,
        nameFix: true,
        schemaDiff: true,
      },
    };
  }

  return {
    runtime,
    features: {
      updater: true,
      extensions: false,
      dbManagement: false,
      ddlImport: false,
      nameFix: true,
      schemaDiff: true,
    },
  };
}
