// Contribution 解決 — 有効な拡張から Navigation / Panel / Settings / Action を抽出

import type {
  ResolvedExtension,
  ActivityBarItem,
  SidebarView,
  WorkbenchView,
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
}

export interface ResolvedActivityBarItem extends ActivityBarItem {
  extensionId: string;
}

export interface ResolvedSidebarView extends SidebarView {
  extensionId: string;
}

export interface ResolvedWorkbenchView extends WorkbenchView {
  extensionId: string;
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

function legacySidebarViewId(nav: NavigationItem): string {
  return `${nav.id}-legacy-sidebar`;
}

function resolveLegacySidebarViews(ext: ResolvedExtension): ResolvedSidebarView[] {
  const legacyNavigation = ext.manifest.contributes?.navigation ?? [];
  return legacyNavigation.map((nav) => ({
    id: legacySidebarViewId(nav),
    label: nav.label,
    activityItemId: nav.id,
    order: nav.order,
    icon: nav.icon,
    extensionId: ext.manifest.id,
  }));
}

function resolveLegacyWorkbenchViews(ext: ResolvedExtension): ResolvedWorkbenchView[] {
  const canonicalActivities = ext.manifest.contributes?.activityBar ?? [];
  const legacyNavigation = ext.manifest.contributes?.navigation ?? [];
  const fallbackActivityItemId =
    canonicalActivities.length === 1
      ? canonicalActivities[0]?.id
      : legacyNavigation.length === 1
        ? legacyNavigation[0]?.id
        : undefined;

  return (ext.manifest.contributes?.workspacePanels ?? []).map((panel) => ({
    id: panel.id,
    title: panel.title,
    activityItemId: fallbackActivityItemId,
    component: panel.component,
    extensionId: ext.manifest.id,
  }));
}

/** アクティビティバー項目を解決し order 昇順でソート */
export function resolveActivityBarItems(exts: ResolvedExtension[]): ResolvedActivityBarItem[] {
  return enabledOnly(exts)
    .flatMap((ext) => {
      const contributed = ext.manifest.contributes?.activityBar ?? [];
      if (contributed.length > 0) {
        return contributed.map((item) => ({
          ...item,
          extensionId: ext.manifest.id,
        }));
      }

      const legacySidebarViews = resolveLegacySidebarViews(ext);
      const legacyWorkbenchViews = resolveLegacyWorkbenchViews(ext);
      return (ext.manifest.contributes?.navigation ?? []).map((nav) => {
        const matchingWorkbenchView =
          legacyWorkbenchViews.find((view) => view.activityItemId === nav.id) ??
          (legacyWorkbenchViews.length === 1 ? legacyWorkbenchViews[0] : undefined);
        const matchingSidebarView =
          legacySidebarViews.find((view) => view.activityItemId === nav.id) ??
          (legacySidebarViews.length === 1 ? legacySidebarViews[0] : undefined);

        return {
          id: nav.id,
          label: nav.label,
          icon: nav.icon,
          order: nav.order,
          extensionId: ext.manifest.id,
          defaultSidebarViewId: matchingSidebarView?.id ?? legacySidebarViewId(nav),
          defaultWorkbenchViewId: matchingWorkbenchView?.id ?? nav.id,
        };
      });
    })
    .sort((a, b) => a.order - b.order);
}

/** サイドバー項目を解決し order 昇順でソート */
export function resolveSidebarViews(exts: ResolvedExtension[]): ResolvedSidebarView[] {
  return enabledOnly(exts)
    .flatMap((ext) => {
      const contributed = ext.manifest.contributes?.sidebarViews ?? [];
      if (contributed.length > 0) {
        return contributed.map((view) => ({
          id: view.id,
          label: view.label,
          activityItemId: view.activityItemId,
          order: view.order,
          icon: view.icon,
          component: view.component,
          runtimeViewId: view.runtimeViewId,
          extensionId: ext.manifest.id,
        }));
      }
      return resolveLegacySidebarViews(ext);
    })
    .sort((a, b) => a.order - b.order);
}

/** ワークベンチビューを解決 */
export function resolveWorkbenchViews(exts: ResolvedExtension[]): ResolvedWorkbenchView[] {
  return enabledOnly(exts).flatMap((ext) => {
    const contributed = ext.manifest.contributes?.workbenchViews ?? [];
    if (contributed.length > 0) {
      return contributed.map((view) => ({
        id: view.id,
        title: view.title,
        activityItemId: view.activityItemId,
        component: view.component,
        runtimeViewId: view.runtimeViewId,
        extensionId: ext.manifest.id,
      }));
    }
    return resolveLegacyWorkbenchViews(ext);
  });
}

/** ナビゲーションエントリを解決し order 昇順でソート */
export function resolveNavigation(exts: ResolvedExtension[]): ResolvedNavItem[] {
  return resolveActivityBarItems(exts).map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    order: item.order,
    extensionId: item.extensionId,
  }));
}

/** ワークスペースパネルを解決 */
export function resolveWorkspacePanels(exts: ResolvedExtension[]): ResolvedWorkspacePanel[] {
  return resolveWorkbenchViews(exts).map((view) => ({
    id: view.id,
    title: view.title,
    component: view.component,
    extensionId: view.extensionId,
  }));
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
