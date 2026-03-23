// Host API ランタイム実装
//
// desktopBridge / useToast をラップして HostApi インターフェースを実体化する。
// 拡張は desktopBridge を直接 import せず、この実装経由で宿主能力にアクセスする。
// grantedCapabilities を受け取り、各メソッド呼び出し時に権限チェックを行う。

import { desktopBridge } from "@/lib/desktop-bridge";
import type { HostApi, ConnectionsApi, NotificationsApi, ToastOptions } from "./host-api";

// 全 Capability を付与する定数（後方互換用）
const ALL_CAPABILITIES: string[] = [
  "db.connect",
  "db.query",
  "db.schema.read",
  "db.schema.apply",
];

/**
 * Capability チェック用ヘルパー
 * 権限が付与されていない場合は即座に rejected Promise を返す
 */
function requireCap(granted: string[], cap: string): void {
  if (!granted.includes(cap)) {
    throw new Error(`Capability not granted: ${cap}`);
  }
}

/**
 * 付与された Capability に基づいてゲートされた ConnectionsApi を生成する
 * 権限がないメソッドを呼び出した場合は Promise.reject を返す
 */
function createConnectionsApi(granted: string[]): ConnectionsApi {
  return {
    // db.connect 権限が必要なメソッド群
    list: () => {
      try { requireCap(granted, "db.connect"); } catch (e) { return Promise.reject(e); }
      return desktopBridge.db.listConnections();
    },
    save: (config) => {
      try { requireCap(granted, "db.connect"); } catch (e) { return Promise.reject(e); }
      return desktopBridge.db.saveConnection(config);
    },
    remove: (id) => {
      try { requireCap(granted, "db.connect"); } catch (e) { return Promise.reject(e); }
      return desktopBridge.db.deleteConnection(id);
    },
    test: (config) => {
      try { requireCap(granted, "db.connect"); } catch (e) { return Promise.reject(e); }
      return desktopBridge.db.testConnection(config);
    },
    // db.schema.read 権限が必要なメソッド群
    introspect: (connectionId) => {
      try { requireCap(granted, "db.schema.read"); } catch (e) { return Promise.reject(e); }
      return desktopBridge.db.introspect(connectionId);
    },
    diff: (sourceId, targetId) => {
      try { requireCap(granted, "db.schema.read"); } catch (e) { return Promise.reject(e); }
      return desktopBridge.db.diff(sourceId, targetId);
    },
  };
}

/** toast 関数を注入して NotificationsApi を生成する */
export function createNotificationsApi(
  toastFn: (options: ToastOptions) => void,
): NotificationsApi {
  // notifications.show は Capability 不要 — 常に利用可能
  return { show: toastFn };
}

/**
 * HostApi インスタンスを生成する
 * grantedCapabilities を省略した場合は全権限を付与する（後方互換）
 */
export function createHostApi(
  toastFn: (options: ToastOptions) => void,
  grantedCapabilities: string[] = ALL_CAPABILITIES,
): HostApi {
  return {
    notifications: createNotificationsApi(toastFn),
    connections: createConnectionsApi(grantedCapabilities),
  };
}
