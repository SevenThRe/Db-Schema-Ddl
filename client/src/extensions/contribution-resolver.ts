// Contribution 解決 — 有効な拡張から Navigation / Panel / Settings / Action を抽出

import type {
  ResolvedExtension,
  NavigationItem,
  WorkspacePanel,
  SettingsSection,
  ContextAction,
} from "@shared/extension-schema";

// ──────────────────────────────────────────────
// 解決済み Contribution 型（拡張 ID 付き）
// ──────────────────────────────────────────────

export interface ResolvedNavItem extends NavigationItem {
  extensionId: string;
  /** ナビゲーション先パネル ID（workspacePanels[0] から自動解決） */
  panelId: string;
}

export interface ResolvedWorkspacePanel extends WorkspacePanel {
  extensionId: string;
}

export interface ResolvedSettingsSection extends SettingsSection {
  extensionId: string;
}

export interface ResolvedContextAction extends ContextAction {
  extensionId: string;
}

// ──────────────────────────────────────────────
// Resolver 関数群
// ──────────────────────────────────────────────

/** 有効な拡張のみ対象にする */
function enabledOnly(exts: ResolvedExtension[]): ResolvedExtension[] {
  return exts.filter((e) => e.enabled);
}

/** ナビゲーションエントリを解決し order 昇順でソート */
export function resolveNavigation(exts: ResolvedExtension[]): ResolvedNavItem[] {
  return enabledOnly(exts)
    .flatMap((ext) => {
      const panels = ext.manifest.contributes?.workspacePanels ?? [];
      return (ext.manifest.contributes?.navigation ?? []).map((nav) => ({
        ...nav,
        extensionId: ext.manifest.id,
        panelId: panels[0]?.id ?? ext.manifest.id,
      }));
    })
    .sort((a, b) => a.order - b.order);
}

/** ワークスペースパネルを解決 */
export function resolveWorkspacePanels(exts: ResolvedExtension[]): ResolvedWorkspacePanel[] {
  return enabledOnly(exts).flatMap((ext) =>
    (ext.manifest.contributes?.workspacePanels ?? []).map((panel) => ({
      ...panel,
      extensionId: ext.manifest.id,
    })),
  );
}

/** 設定セクションを解決し order 昇順でソート */
export function resolveSettingsSections(exts: ResolvedExtension[]): ResolvedSettingsSection[] {
  return enabledOnly(exts)
    .flatMap((ext) =>
      (ext.manifest.contributes?.settingsSections ?? []).map((sec) => ({
        ...sec,
        extensionId: ext.manifest.id,
      })),
    )
    .sort((a, b) => a.order - b.order);
}

/** コンテキストアクションを解決 */
export function resolveContextActions(exts: ResolvedExtension[]): ResolvedContextAction[] {
  return enabledOnly(exts).flatMap((ext) =>
    (ext.manifest.contributes?.contextActions ?? []).map((action) => ({
      ...action,
      extensionId: ext.manifest.id,
    })),
  );
}
