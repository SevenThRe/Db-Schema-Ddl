import type {
  DbSqlCopilotProbeRequest,
  DbSqlCopilotProbeResponse,
  DbSqlCopilotPromptPackage,
} from "@shared/schema";
import type { SqlSemanticContext } from "./sql-semantic-types";
import {
  parseSqlCopilotGeneratedDraft,
  type SqlCopilotGeneratedDraft,
  type SqlCopilotGenerationMode,
} from "./sql-copilot-generation";
import {
  buildEmptyGeneratedSqlDraftNotice,
  buildGeneratedSqlDraftFailure,
  buildGeneratedSqlDraftSuccessNotice,
  buildSqlCopilotProbeFailure,
  buildSqlCopilotProbeSuccessNotice,
  getSqlCopilotRuntimeGateNotice,
  type SqlCopilotNotice,
} from "./sql-copilot-runtime";

export interface RunSqlCopilotProbeInput {
  settingsDirty: boolean;
  runtimeEnabled: boolean;
  promptPackage: DbSqlCopilotPromptPackage;
  warmupOnly: boolean;
  runProbe: (
    request: DbSqlCopilotProbeRequest,
  ) => Promise<DbSqlCopilotProbeResponse>;
  beginProbe: () => void;
  setProbeError: (message: string | null) => void;
  applyProbeResult: (response: DbSqlCopilotProbeResponse) => void;
  refetchRuntime: () => Promise<unknown>;
  showNotification: (notice: SqlCopilotNotice) => void;
  finishProbe: () => void;
}

export interface SqlCopilotStateActions {
  openDialog: () => void;
  closeDialog: () => void;
  beginProbe: () => void;
  setProbeError: (message: string | null) => void;
  applyProbeResult: (response: DbSqlCopilotProbeResponse) => void;
  finishProbe: () => void;
  beginGenerate: () => void;
  applyGeneratedDraft: (draft: SqlCopilotGeneratedDraft | null) => void;
  setGenerationError: (message: string | null) => void;
  finishGenerate: () => void;
}

export function createSqlCopilotStateActions(input: {
  setDialogOpen: (open: boolean) => void;
  setIsRunningProbe: (isRunning: boolean) => void;
  setProbeError: (message: string | null) => void;
  setProbeResult: (response: DbSqlCopilotProbeResponse) => void;
  setIsGeneratingDraft: (isGenerating: boolean) => void;
  setGeneratedDraft: (draft: SqlCopilotGeneratedDraft | null) => void;
  setGenerationError: (message: string | null) => void;
}): SqlCopilotStateActions {
  return {
    openDialog: () => input.setDialogOpen(true),
    closeDialog: () => input.setDialogOpen(false),
    beginProbe: () => input.setIsRunningProbe(true),
    setProbeError: input.setProbeError,
    applyProbeResult: input.setProbeResult,
    finishProbe: () => input.setIsRunningProbe(false),
    beginGenerate: () => input.setIsGeneratingDraft(true),
    applyGeneratedDraft: input.setGeneratedDraft,
    setGenerationError: input.setGenerationError,
    finishGenerate: () => input.setIsGeneratingDraft(false),
  };
}

export async function runSqlCopilotProbe(
  input: RunSqlCopilotProbeInput,
): Promise<DbSqlCopilotProbeResponse | null> {
  const gateNotice = getSqlCopilotRuntimeGateNotice({
    settingsDirty: input.settingsDirty,
    runtimeEnabled: input.runtimeEnabled,
    action: "probe",
  });
  if (gateNotice) {
    input.showNotification(gateNotice);
    return null;
  }

  input.beginProbe();
  input.setProbeError(null);
  try {
    const response = await input.runProbe({
      promptPackage: input.promptPackage,
      warmupOnly: input.warmupOnly,
    });
    input.applyProbeResult(response);
    await input.refetchRuntime();
    input.showNotification(
      buildSqlCopilotProbeSuccessNotice({
        response,
        warmupOnly: input.warmupOnly,
      }),
    );
    return response;
  } catch (error) {
    const failure = buildSqlCopilotProbeFailure(error);
    input.setProbeError(failure.message);
    await input.refetchRuntime();
    input.showNotification(failure.notice);
    return null;
  } finally {
    input.finishProbe();
  }
}

export interface RunSqlCopilotGenerateDraftInput {
  settingsDirty: boolean;
  runtimeEnabled: boolean;
  promptPackage: DbSqlCopilotPromptPackage;
  generationMode: SqlCopilotGenerationMode;
  semanticContext?: SqlSemanticContext | null;
  runProbe: (
    request: DbSqlCopilotProbeRequest,
  ) => Promise<DbSqlCopilotProbeResponse>;
  beginGenerate: () => void;
  applyGeneratedDraft: (draft: SqlCopilotGeneratedDraft | null) => void;
  setGenerationError: (message: string | null) => void;
  setProbeError: (message: string | null) => void;
  applyProbeResult: (response: DbSqlCopilotProbeResponse) => void;
  refetchRuntime: () => Promise<unknown>;
  showNotification: (notice: SqlCopilotNotice) => void;
  finishGenerate: () => void;
}

export async function runSqlCopilotGenerateDraft(
  input: RunSqlCopilotGenerateDraftInput,
): Promise<SqlCopilotGeneratedDraft | null> {
  const gateNotice = getSqlCopilotRuntimeGateNotice({
    settingsDirty: input.settingsDirty,
    runtimeEnabled: input.runtimeEnabled,
    action: "generate",
  });
  if (gateNotice) {
    input.showNotification(gateNotice);
    return null;
  }

  input.beginGenerate();
  input.applyGeneratedDraft(null);
  input.setGenerationError(null);
  input.setProbeError(null);
  try {
    const response = await input.runProbe({
      promptPackage: input.promptPackage,
    });
    const draft = parseSqlCopilotGeneratedDraft({
      rawOutput: response.outputText,
      completionMode: input.generationMode,
      semanticContext: input.semanticContext,
    });

    input.applyProbeResult(response);
    input.applyGeneratedDraft(draft);
    await input.refetchRuntime();

    if (!draft.sql.trim()) {
      const emptyDraft = buildEmptyGeneratedSqlDraftNotice(draft);
      input.setGenerationError(emptyDraft.message);
      input.showNotification(emptyDraft.notice);
      return draft;
    }

    input.showNotification(
      buildGeneratedSqlDraftSuccessNotice({ response, draft }),
    );
    return draft;
  } catch (error) {
    const failure = buildGeneratedSqlDraftFailure(error);
    input.setGenerationError(failure.message);
    input.setProbeError(failure.message);
    await input.refetchRuntime();
    input.showNotification(failure.notice);
    return null;
  } finally {
    input.finishGenerate();
  }
}
