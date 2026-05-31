import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
  DdlSettings,
} from "@shared/schema";
import type { QueryTab } from "./query-tabs-storage";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import type { SqlWorkbenchMemoryState } from "./sql-memory";
import { buildSqlCopilotPromptPackage } from "./sql-copilot-grounding";
import {
  buildSqlCopilotGenerationPromptPackage,
  buildSqlCopilotGenerationSemanticContext,
  deriveSqlCopilotGenerationMode,
} from "./sql-copilot-generation";
import {
  mergeSqlCopilotSettings,
  pickSqlCopilotSettings,
  sqlCopilotSettingsEqual,
} from "./sql-copilot-settings";
import { formatWorkbenchError } from "./workbench-errors";

export interface BuildWorkbenchSqlCopilotContextInput {
  ddlSettings: DdlSettings | null | undefined;
  defaultDdlSettings: DdlSettings;
  settingsDraft: SqlCopilotSettingsDraft;
  runtimeError: unknown;
  tabs: QueryTab[];
  activeTabId: string;
  connection: DbConnectionConfig;
  schemaSnapshot: DbSchemaSnapshot | null | undefined;
  sqlMemory: SqlWorkbenchMemoryState;
  runtimeSchema: string | null | undefined;
  selectedTableName: string | null | undefined;
  operatorPrompt: string;
}

export function buildWorkbenchSqlCopilotContext(
  input: BuildWorkbenchSqlCopilotContextInput,
) {
  const persistedSettings = input.ddlSettings ?? input.defaultDdlSettings;
  const effectiveSettings = mergeSqlCopilotSettings(
    persistedSettings,
    input.settingsDraft,
  );
  const activeSqlText =
    (input.tabs.find((tab) => tab.id === input.activeTabId) ?? input.tabs[0])
      ?.sql ?? "";
  const promptPackage = buildSqlCopilotPromptPackage({
    settings: effectiveSettings,
    connection: input.connection,
    schemaSnapshot: input.schemaSnapshot,
    sqlMemory: input.sqlMemory,
    currentSql: activeSqlText,
    activeSchema: input.runtimeSchema,
    selectedTableName: input.selectedTableName,
    operatorPrompt: input.operatorPrompt,
  });
  const generationMode = deriveSqlCopilotGenerationMode(
    activeSqlText,
    input.operatorPrompt,
  );

  return {
    effectiveSettings,
    settingsDirty: !sqlCopilotSettingsEqual(
      input.settingsDraft,
      pickSqlCopilotSettings(persistedSettings),
    ),
    runtimeErrorMessage: input.runtimeError
      ? formatWorkbenchError(
          input.runtimeError,
          "Unable to refresh local SQL copilot runtime state.",
        )
      : null,
    activeSqlText,
    promptPackage,
    generationMode,
    generationPromptPackage: buildSqlCopilotGenerationPromptPackage({
      basePromptPackage: promptPackage,
      connection: input.connection,
      currentSql: activeSqlText,
      operatorPrompt: input.operatorPrompt,
    }),
    generationSemanticContext: buildSqlCopilotGenerationSemanticContext(
      input.schemaSnapshot ?? null,
      input.runtimeSchema ?? null,
    ),
  };
}
