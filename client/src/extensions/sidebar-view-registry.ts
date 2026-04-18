import type { ComponentType } from "react";
import type { MainSurface } from "./host-api";

export interface ExtensionSidebarViewProps {
  extensionId: string;
  activityItemId?: string;
  sidebarViewId: string;
  workbenchViewId?: string;
  onNavigate: (surface: MainSurface) => void;
  onSelectSidebarView: (sidebarViewId: string) => void;
  onOpenWorkbenchView: (workbenchViewId?: string) => void;
}

type SidebarViewComponent = ComponentType<ExtensionSidebarViewProps>;

const registry = new Map<string, SidebarViewComponent>();

export function registerSidebarView(key: string, component: SidebarViewComponent): void {
  registry.set(key, component);
}

export function getSidebarView(key: string): SidebarViewComponent | undefined {
  return registry.get(key);
}

export function listRegisteredSidebarViews(): string[] {
  return Array.from(registry.keys());
}
