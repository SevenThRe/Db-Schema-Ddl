// 拡張ホストコンテキスト — ext_list_all から統合拡張状態を提供
//
// Dashboard のルートで <ExtensionHostProvider> を配置し、
// 子コンポーネントは useExtensionHost() で Contribution 解決結果を取得する。
// useHostApiFor(extensionId) で拡張ごとに Capability スコープ済み HostApi を取得する。

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ResolvedExtension } from "@shared/extension-schema";
import {
  resolveNavigation,
  resolveWorkspacePanels,
  resolveSettingsSections,
  resolveContextActions,
  type ResolvedNavItem,
  type ResolvedWorkspacePanel,
  type ResolvedSettingsSection,
  type ResolvedContextAction,
} from "./contribution-resolver";
import { desktopBridge } from "@/lib/desktop-bridge";
import { useToast } from "@/hooks/use-toast";
import { createHostApi } from "./host-api-runtime";
import type { HostApi } from "./host-api";
import { useStatusBarController } from "@/status-bar/context";

// ──────────────────────────────────────────────
// Context 型定義
// ──────────────────────────────────────────────

export interface ExtensionHostState {
  extensions: ResolvedExtension[];
  isLoading: boolean;
  navigation: ResolvedNavItem[];
  workspacePanels: ResolvedWorkspacePanel[];
  settingsSections: ResolvedSettingsSection[];
  contextActions: ResolvedContextAction[];
  hostApi: HostApi;
}

/** デフォルト HostApi（Context 外での安全なフォールバック） */
const noopHostApi: HostApi = {
  notifications: { show: () => {} },
  connections: {
    list: () => Promise.resolve([]),
    save: () => Promise.reject(new Error("HostApi not available")),
    remove: () => Promise.reject(new Error("HostApi not available")),
    test: () => Promise.reject(new Error("HostApi not available")),
    introspect: () => Promise.reject(new Error("HostApi not available")),
    diff: () => Promise.reject(new Error("HostApi not available")),
    // Phase 1 DB 工作台 — フォールバック実装
    executeQuery: () => Promise.reject(new Error("HostApi not available")),
    explainQuery: () => Promise.reject(new Error("HostApi not available")),
    cancelQuery: () => Promise.reject(new Error("HostApi not available")),
    previewDangerousSql: () => Promise.reject(new Error("HostApi not available")),
    exportRows: () => Promise.reject(new Error("HostApi not available")),
    fetchMore: () => Promise.reject(new Error("HostApi not available")),
    prepareGridCommit: () => Promise.reject(new Error("HostApi not available")),
    commitGridEdits: () => Promise.reject(new Error("HostApi not available")),
    previewDataDiff: () => Promise.reject(new Error("HostApi not available")),
    fetchDataDiffDetail: () => Promise.reject(new Error("HostApi not available")),
    previewDataApply: () => Promise.reject(new Error("HostApi not available")),
    executeDataApply: () => Promise.reject(new Error("HostApi not available")),
    fetchDataApplyJobDetail: () => Promise.reject(new Error("HostApi not available")),
  },
  statusBar: {
    set: () => () => {},
    clear: () => {},
    clearAll: () => {},
  },
};

const defaultState: ExtensionHostState = {
  extensions: [],
  isLoading: false,
  navigation: [],
  workspacePanels: [],
  settingsSections: [],
  contextActions: [],
  hostApi: noopHostApi,
};

const ExtensionHostContext = createContext<ExtensionHostState>(defaultState);

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

export function ExtensionHostProvider({ children }: { children: ReactNode }) {
  const capabilities = desktopBridge.getCapabilities();
  const { toast } = useToast();
  const statusBarController = useStatusBarController();
  const hostApi = useMemo(
    () => createHostApi(toast, undefined, statusBarController, "host"),
    [statusBarController, toast],
  );

  const { data: extensions = [], isLoading } = useQuery<ResolvedExtension[]>({
    queryKey: ["extensions", "all"],
    queryFn: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<ResolvedExtension[]>("ext_list_all");
    },
    staleTime: 60_000,
    enabled: capabilities.features.extensions,
  });

  const navigation = useMemo(() => resolveNavigation(extensions), [extensions]);
  const workspacePanels = useMemo(() => resolveWorkspacePanels(extensions), [extensions]);
  const settingsSections = useMemo(() => resolveSettingsSections(extensions), [extensions]);
  const contextActions = useMemo(() => resolveContextActions(extensions), [extensions]);

  const value = useMemo<ExtensionHostState>(
    () => ({
      extensions,
      isLoading,
      navigation,
      workspacePanels,
      settingsSections,
      contextActions,
      hostApi,
    }),
    [extensions, isLoading, navigation, workspacePanels, settingsSections, contextActions, hostApi],
  );

  return (
    <ExtensionHostContext.Provider value={value}>
      {children}
    </ExtensionHostContext.Provider>
  );
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

export function useExtensionHost(): ExtensionHostState {
  return useContext(ExtensionHostContext);
}

/**
 * 全 Capability を付与した HostApi を返すショートカット hook（後方互換・ホスト内部用）
 * builtin 拡張以外から呼ぶ場合は useHostApiFor を使用すること
 */
export function useHostApi(): HostApi {
  return useContext(ExtensionHostContext).hostApi;
}

/**
 * 指定した拡張 ID の Capability に基づいてスコープ済み HostApi を返す hook
 * マニフェストに宣言された capabilities のみが有効になる
 */
export function useHostApiFor(extensionId: string): HostApi {
  const { extensions } = useContext(ExtensionHostContext);
  const { toast } = useToast();
  const statusBarController = useStatusBarController();

  return useMemo(() => {
    const ext = extensions.find((e) => e.manifest.id === extensionId);
    // 未知の extensionId → 全メソッド拒否（権限ゼロ）で安全に失敗させる
    const caps = ext?.manifest.capabilities ?? [];
    return createHostApi(toast, caps, statusBarController, `ext:${extensionId}`);
  }, [extensionId, extensions, statusBarController, toast]);
}
