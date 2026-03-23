// パネルレジストリ — builtin 拡張コンポーネントの登録と取得
//
// 起動時に register-all.ts から呼ばれ、
// ExtensionWorkspaceHost が panelId でコンポーネントを解決する。

import type { ComponentType } from "react";

export interface ExtensionWorkspaceProps {
  extensionId: string;
  fileId?: number | null;
  fileName?: string | null;
}

type PanelComponent = ComponentType<ExtensionWorkspaceProps>;

const registry = new Map<string, PanelComponent>();

export function registerPanel(key: string, component: PanelComponent): void {
  registry.set(key, component);
}

export function getPanel(key: string): PanelComponent | undefined {
  return registry.get(key);
}

export function listRegisteredPanels(): string[] {
  return Array.from(registry.keys());
}
