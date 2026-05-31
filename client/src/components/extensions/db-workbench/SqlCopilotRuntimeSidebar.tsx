import type { DbSqlCopilotRuntimeState } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import {
  SqlCopilotDiscoveredRuntimesSection,
  SqlCopilotRuntimeSettingsSection,
} from "./sql-copilot-runtime-sidebar-sections";

interface SqlCopilotRuntimeSidebarProps {
  settings: SqlCopilotSettingsDraft;
  runtimeCards: DbSqlCopilotRuntimeState["discoveredRuntimes"];
  isSavingSettings: boolean;
  onSettingChange: <K extends keyof SqlCopilotSettingsDraft>(
    key: K,
    value: SqlCopilotSettingsDraft[K],
  ) => void;
  onSaveSettings: () => void;
}

export function SqlCopilotRuntimeSidebar({
  settings,
  runtimeCards,
  isSavingSettings,
  onSettingChange,
  onSaveSettings,
}: SqlCopilotRuntimeSidebarProps) {
  return (
    <ScrollArea className="min-h-0">
      <div className="space-y-4 p-4">
        <SqlCopilotRuntimeSettingsSection
          settings={settings}
          isSavingSettings={isSavingSettings}
          onSettingChange={onSettingChange}
          onSaveSettings={onSaveSettings}
        />
        <SqlCopilotDiscoveredRuntimesSection runtimeCards={runtimeCards} />
      </div>
    </ScrollArea>
  );
}
