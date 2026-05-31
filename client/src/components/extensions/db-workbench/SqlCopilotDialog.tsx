import type {
  DbSqlCopilotProbeResponse,
  DbSqlCopilotPromptPackage,
  DbSqlCopilotRuntimeState,
  DdlSettings,
} from "@shared/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type {
  SqlCopilotGeneratedDraft,
  SqlCopilotGenerationMode,
} from "./sql-copilot-generation";
import { SqlCopilotDialogContent } from "./sql-copilot-dialog-sections";

export type SqlCopilotSettingsDraft = Pick<
  DdlSettings,
  | "sqlCopilotEnabled"
  | "sqlCopilotProvider"
  | "sqlCopilotOllamaBaseUrl"
  | "sqlCopilotOllamaModel"
  | "sqlCopilotLlamaCliPath"
  | "sqlCopilotLlamaModelPath"
  | "sqlCopilotMaxOutputTokens"
  | "sqlCopilotTemperature"
  | "sqlCopilotGroundingMaxTables"
  | "sqlCopilotGroundingMaxPatterns"
  | "sqlCopilotGroundingMaxValueProfiles"
  | "sqlCopilotRequestTimeoutMs"
>;

export interface SqlCopilotDialogProps {
  open: boolean;
  connectionLabel: string;
  settings: SqlCopilotSettingsDraft;
  runtimeState: DbSqlCopilotRuntimeState | null;
  runtimeLoading: boolean;
  runtimeError: string | null;
  hasUnsavedSettings: boolean;
  promptPackage: DbSqlCopilotPromptPackage;
  generationPromptPackage: DbSqlCopilotPromptPackage;
  generationMode: SqlCopilotGenerationMode;
  operatorPrompt: string;
  probeResult: DbSqlCopilotProbeResponse | null;
  probeError: string | null;
  generatedDraft: SqlCopilotGeneratedDraft | null;
  generationError: string | null;
  isSavingSettings: boolean;
  isRunningProbe: boolean;
  isGeneratingDraft: boolean;
  onSettingChange: <K extends keyof SqlCopilotSettingsDraft>(
    key: K,
    value: SqlCopilotSettingsDraft[K],
  ) => void;
  onOperatorPromptChange: (value: string) => void;
  onSaveSettings: () => void;
  onRunWarmup: () => void;
  onRunProbe: () => void;
  onGenerateDraft: () => void;
  onReplaceActiveTabWithDraft: () => void;
  onOpenDraftInNewTab: () => void;
  onRunDraftWithSafetyGates: () => void;
  onClose: () => void;
}

export function SqlCopilotDialog({
  open,
  connectionLabel,
  settings,
  runtimeState,
  runtimeLoading,
  runtimeError,
  hasUnsavedSettings,
  promptPackage,
  generationPromptPackage,
  generationMode,
  operatorPrompt,
  probeResult,
  probeError,
  generatedDraft,
  generationError,
  isSavingSettings,
  isRunningProbe,
  isGeneratingDraft,
  onSettingChange,
  onOperatorPromptChange,
  onSaveSettings,
  onRunWarmup,
  onRunProbe,
  onGenerateDraft,
  onReplaceActiveTabWithDraft,
  onOpenDraftInNewTab,
  onRunDraftWithSafetyGates,
  onClose,
}: SqlCopilotDialogProps) {
  const runtimeCards = runtimeState?.discoveredRuntimes ?? [];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-7xl overflow-hidden p-0">
        <SqlCopilotDialogContent
          connectionLabel={connectionLabel}
          settings={settings}
          runtimeState={runtimeState}
          runtimeLoading={runtimeLoading}
          runtimeError={runtimeError}
          hasUnsavedSettings={hasUnsavedSettings}
          runtimeCards={runtimeCards}
          promptPackage={promptPackage}
          generationPromptPackage={generationPromptPackage}
          generationMode={generationMode}
          operatorPrompt={operatorPrompt}
          probeResult={probeResult}
          probeError={probeError}
          generatedDraft={generatedDraft}
          generationError={generationError}
          isSavingSettings={isSavingSettings}
          isRunningProbe={isRunningProbe}
          isGeneratingDraft={isGeneratingDraft}
          onSettingChange={onSettingChange}
          onOperatorPromptChange={onOperatorPromptChange}
          onSaveSettings={onSaveSettings}
          onRunWarmup={onRunWarmup}
          onRunProbe={onRunProbe}
          onGenerateDraft={onGenerateDraft}
          onReplaceActiveTabWithDraft={onReplaceActiveTabWithDraft}
          onOpenDraftInNewTab={onOpenDraftInNewTab}
          onRunDraftWithSafetyGates={onRunDraftWithSafetyGates}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
