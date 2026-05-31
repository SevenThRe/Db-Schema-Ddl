import type { SqlCopilotGenerationMode } from "./sql-copilot-generation";

export function formatRuntimeLabel(value: string | undefined): string {
  if (!value) return "unknown";
  return value.replace(/_/g, " ");
}

export function numberValue(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

export interface SqlCopilotRuntimeActionState {
  enabled: boolean;
  isRunningProbe: boolean;
  isGeneratingDraft: boolean;
  hasUnsavedSettings: boolean;
}

export function isSqlCopilotRuntimeActionDisabled({
  enabled,
  isRunningProbe,
  isGeneratingDraft,
  hasUnsavedSettings,
}: SqlCopilotRuntimeActionState): boolean {
  return !enabled || isRunningProbe || isGeneratingDraft || hasUnsavedSettings;
}

export interface SqlCopilotRuntimeStatusInput {
  runtimeLoading: boolean;
  runtimeError: string | null;
  statusSummary?: string | null;
}

export function formatSqlCopilotRuntimeStatus({
  runtimeLoading,
  runtimeError,
  statusSummary,
}: SqlCopilotRuntimeStatusInput): string {
  if (runtimeLoading) return "Refreshing local runtime availability...";
  return runtimeError ?? statusSummary ?? "Load runtime status to inspect local model readiness.";
}

export function formatGenerationMode(mode: SqlCopilotGenerationMode): string {
  switch (mode) {
    case "intent_refinement":
      return "intent refinement";
    case "partial_sql_completion":
      return "partial SQL completion";
    case "natural_language":
    default:
      return "natural language";
  }
}
