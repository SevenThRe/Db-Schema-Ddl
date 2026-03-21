export type DesktopRuntime = "tauri" | "web";

export interface DesktopFeatureFlags {
  updater: boolean;
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

  return "web";
}

export function getDesktopCapabilities(): DesktopCapabilities {
  const runtime = detectRuntime();

  if (runtime === "tauri") {
    return {
      runtime,
      features: {
        updater: false,
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
      ddlImport: false,
      nameFix: false,
      schemaDiff: false,
    },
  };
}
