import type {
  DbSqlCopilotProbeResponse,
  DbSqlCopilotPromptPackage,
  DbSqlCopilotRuntimeState,
} from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  SqlCopilotGeneratedDraft,
  SqlCopilotGenerationMode,
} from "./sql-copilot-generation";
import {
  formatRuntimeLabel,
  formatSqlCopilotRuntimeStatus,
  isSqlCopilotRuntimeActionDisabled,
} from "./sql-copilot-dialog-model";
import { SqlCopilotMainPanel } from "./sql-copilot-dialog-main-panel";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import { SqlCopilotRuntimeSidebar } from "./SqlCopilotRuntimeSidebar";

type RuntimeCards = NonNullable<DbSqlCopilotRuntimeState["discoveredRuntimes"]>;

export interface SqlCopilotDialogContentProps {
  connectionLabel: string;
  settings: SqlCopilotSettingsDraft;
  runtimeState: DbSqlCopilotRuntimeState | null;
  runtimeLoading: boolean;
  runtimeError: string | null;
  hasUnsavedSettings: boolean;
  runtimeCards: RuntimeCards;
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

export function SqlCopilotDialogContent({
  connectionLabel,
  settings,
  runtimeState,
  runtimeLoading,
  runtimeError,
  hasUnsavedSettings,
  runtimeCards,
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
}: SqlCopilotDialogContentProps) {
  const runtimeActionDisabled = isSqlCopilotRuntimeActionDisabled({
    enabled: settings.sqlCopilotEnabled,
    isRunningProbe,
    isGeneratingDraft,
    hasUnsavedSettings,
  });

  return (
    <div className="flex max-h-[86vh] flex-col">
      <SqlCopilotDialogHeader connectionLabel={connectionLabel} />
      <SqlCopilotRuntimeStatusBar
        settings={settings}
        runtimeState={runtimeState}
        runtimeLoading={runtimeLoading}
        runtimeError={runtimeError}
        hasUnsavedSettings={hasUnsavedSettings}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] divide-x divide-border">
        <SqlCopilotRuntimeSidebar
          settings={settings}
          runtimeCards={runtimeCards}
          isSavingSettings={isSavingSettings}
          onSettingChange={onSettingChange}
          onSaveSettings={onSaveSettings}
        />

        <SqlCopilotMainPanel
          promptPackage={promptPackage}
          generationPromptPackage={generationPromptPackage}
          generationMode={generationMode}
          operatorPrompt={operatorPrompt}
          probeResult={probeResult}
          probeError={probeError}
          generatedDraft={generatedDraft}
          generationError={generationError}
          hasUnsavedSettings={hasUnsavedSettings}
          runtimeActionDisabled={runtimeActionDisabled}
          isRunningProbe={isRunningProbe}
          isGeneratingDraft={isGeneratingDraft}
          onOperatorPromptChange={onOperatorPromptChange}
          onRunWarmup={onRunWarmup}
          onRunProbe={onRunProbe}
          onGenerateDraft={onGenerateDraft}
          onReplaceActiveTabWithDraft={onReplaceActiveTabWithDraft}
          onOpenDraftInNewTab={onOpenDraftInNewTab}
          onRunDraftWithSafetyGates={onRunDraftWithSafetyGates}
        />
      </div>

      <DialogFooter className="border-t border-border px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}

function SqlCopilotDialogHeader({ connectionLabel }: { connectionLabel: string }) {
  return (
    <DialogHeader className="border-b border-border px-5 py-4">
      <DialogTitle>SQL copilot runtime</DialogTitle>
      <DialogDescription>
        Configure and probe a strictly local SQL-assist runtime for {connectionLabel}. This surface
        is advisory only: it never executes SQL and never pretends model output is a deterministic
        engine result.
      </DialogDescription>
    </DialogHeader>
  );
}

function SqlCopilotRuntimeStatusBar({
  settings,
  runtimeState,
  runtimeLoading,
  runtimeError,
  hasUnsavedSettings,
}: Pick<
  SqlCopilotDialogContentProps,
  "settings" | "runtimeState" | "runtimeLoading" | "runtimeError" | "hasUnsavedSettings"
>) {
  return (
    <div className="border-b border-border px-5 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          privacy: offline_local_only
        </Badge>
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          provider: {settings.sqlCopilotProvider}
        </Badge>
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          availability: {formatRuntimeLabel(runtimeState?.availability)}
        </Badge>
        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
          warmup: {formatRuntimeLabel(runtimeState?.warmupState)}
        </Badge>
        {hasUnsavedSettings ? (
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            unsaved runtime edits
          </Badge>
        ) : null}
        {runtimeState?.configuredModelId ? (
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            model: {runtimeState.configuredModelId}
          </Badge>
        ) : null}
        {runtimeState?.lastLatencyMs ? (
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            last latency: {runtimeState.lastLatencyMs} ms
          </Badge>
        ) : null}
        <span className="truncate">
          {formatSqlCopilotRuntimeStatus({
            runtimeLoading,
            runtimeError,
            statusSummary: runtimeState?.statusSummary,
          })}
        </span>
      </div>
    </div>
  );
}
