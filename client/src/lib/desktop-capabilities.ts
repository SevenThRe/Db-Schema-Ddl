// Tauri デスクトップランタイム専用の機能フラグ定義
// Web モードは開発プレビュー用途のみ。全機能は Tauri 経由で提供される。

export type DesktopRuntime = "tauri" | "web";

export interface DesktopFeatureFlags {
  updater: boolean;
  ddlImport: boolean;
  nameFix: boolean;
  schemaDiff: boolean;
  extensions: boolean;
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
        // GitHub API fetch は Tauri webview から利用可能
        updater: true,
        ddlImport: true,
        nameFix: true,
        schemaDiff: true,
        extensions: true,
      },
    };
  }

  // Web プレビューモード: UI 開発用途のみ。全機能は無効。
  return {
    runtime,
    features: {
      updater: false,
      ddlImport: false,
      nameFix: false,
      schemaDiff: false,
      extensions: false,
    },
  };
}
