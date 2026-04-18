// 拡張機能管理 hook — Tauri invoke ベース
//
// useQuery / useMutation で TanStack Query キャッシュと統合。
// Tauri 以外の環境では全操作が no-op になる。

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ──────────────────────────────────────────────
// Tauri invoke レスポンス型（shared/extension-schema.ts と対応）
// ──────────────────────────────────────────────

export interface InstalledExtension {
  manifest: {
    id: string;
    name: string;
    version: string;
    description: string;
    publisher: string;
    capabilities: string[];
  };
  installed_at: string;
  entry_path: string | null;
}

export interface RunningProcess {
  pid: number;
  port: number;
}

export interface ExtensionCatalog {
  latest_version: string;
  release_notes: string;
  download_url: string;
  sha256_url: string;
  size_bytes: number;
  published_at: string;
  update_available: boolean;
}

// ──────────────────────────────────────────────
// クエリキー
// ──────────────────────────────────────────────

const EXTENSIONS_KEY = ["extensions", "list"] as const;
const RESOLVED_EXTENSIONS_KEY = ["extensions", "all"] as const;

// ──────────────────────────────────────────────
// Hook 本体
// ──────────────────────────────────────────────

export function useExtensions() {
  const queryClient = useQueryClient();

  // インストール済み一覧
  const listQuery = useQuery<InstalledExtension[]>({
    queryKey: EXTENSIONS_KEY,
    queryFn: () => invoke<InstalledExtension[]>("ext_list"),
    staleTime: 30_000,
  });

  // インストール
  const installMutation = useMutation({
    mutationFn: (id: string) => invoke<InstalledExtension>("ext_install", { id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: EXTENSIONS_KEY });
      await queryClient.invalidateQueries({ queryKey: RESOLVED_EXTENSIONS_KEY });
    },
  });

  // アンインストール
  const uninstallMutation = useMutation({
    mutationFn: (id: string) => invoke<void>("ext_uninstall", { id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: EXTENSIONS_KEY });
      await queryClient.invalidateQueries({ queryKey: RESOLVED_EXTENSIONS_KEY });
    },
  });

  const setEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      invoke<void>("ext_set_enabled", { id, enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: EXTENSIONS_KEY });
      await queryClient.invalidateQueries({ queryKey: RESOLVED_EXTENSIONS_KEY });
    },
  });

  // 起動
  const startMutation = useMutation({
    mutationFn: (id: string) => invoke<RunningProcess>("ext_start", { id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RESOLVED_EXTENSIONS_KEY });
    },
  });

  // 停止
  const stopMutation = useMutation({
    mutationFn: (id: string) => invoke<void>("ext_stop", { id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RESOLVED_EXTENSIONS_KEY });
    },
  });

  // カタログ取得（命令的に呼ぶ用）
  const fetchCatalog = (id: string, installedVersion?: string) =>
    invoke<ExtensionCatalog>("ext_fetch_catalog", {
      id,
      installed_version: installedVersion ?? null,
    });

  return {
    extensions: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    install: installMutation.mutateAsync,
    isInstalling: installMutation.isPending,
    installError: installMutation.error,
    uninstall: uninstallMutation.mutateAsync,
    isUninstalling: uninstallMutation.isPending,
    setEnabled: (id: string, enabled: boolean) => setEnabledMutation.mutateAsync({ id, enabled }),
    isSettingEnabled: setEnabledMutation.isPending,
    start: startMutation.mutateAsync,
    isStarting: startMutation.isPending,
    stop: stopMutation.mutateAsync,
    isStopping: stopMutation.isPending,
    fetchCatalog,
  };
}
