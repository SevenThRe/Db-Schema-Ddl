import type { DdlSettings } from "@shared/schema";
import type { SqlCopilotSettingsDraft } from "./SqlCopilotDialog";
import {
  pickSqlCopilotSettings,
} from "./sql-copilot-settings";
import {
  buildSchemaLoadFailureNotice,
  buildSchemaOptionsFailureNotice,
  resolveSelectedTableName,
  type WorkbenchSchemaNotice,
} from "./workbench-schema-runtime";
import { formatWorkbenchError } from "./workbench-errors";

export interface WorkbenchSchemaStateActions {
  notifySchemaLoadFailure: (schemaErrorMessage: string | null) => boolean;
  notifySchemaOptionsFailure: (driver: string, schemaOptionsError: unknown) => boolean;
  applyDdlSettingsToSqlCopilotDraft: (ddlSettings: DdlSettings | undefined) => boolean;
  notifyDdlSettingsFailure: (ddlSettingsError: unknown) => boolean;
  resolveSelectedTableForSchema: (tables: Array<{ name: string }> | undefined) => void;
}

export function createWorkbenchSchemaStateActions(input: {
  showNotification: (
    notification:
      | WorkbenchSchemaNotice
      | {
          title: string;
          description: string;
          variant: "destructive";
        },
  ) => void;
  setSqlCopilotSettingsDraft: (draft: SqlCopilotSettingsDraft) => void;
  setSelectedTableName: (
    updater: (currentTableName: string | null) => string | null,
  ) => void;
}): WorkbenchSchemaStateActions {
  return {
    notifySchemaLoadFailure: (schemaErrorMessage) =>
      runNotifySchemaLoadFailure({
        schemaErrorMessage,
        showNotification: input.showNotification,
      }),
    notifySchemaOptionsFailure: (driver, schemaOptionsError) =>
      runNotifySchemaOptionsFailure({
        driver,
        schemaOptionsError,
        showNotification: input.showNotification,
      }),
    applyDdlSettingsToSqlCopilotDraft: (ddlSettings) =>
      runApplyDdlSettingsToSqlCopilotDraft({
        ddlSettings,
        setSqlCopilotSettingsDraft: input.setSqlCopilotSettingsDraft,
      }),
    notifyDdlSettingsFailure: (ddlSettingsError) =>
      runNotifyDdlSettingsFailure({
        ddlSettingsError,
        showNotification: input.showNotification,
      }),
    resolveSelectedTableForSchema: (tables) =>
      runResolveSelectedTableForSchema({
        tables,
        setSelectedTableName: input.setSelectedTableName,
      }),
  };
}

export function runNotifySchemaLoadFailure(input: {
  schemaErrorMessage: string | null;
  showNotification: (notification: WorkbenchSchemaNotice) => void;
}): boolean {
  if (!input.schemaErrorMessage) return false;
  input.showNotification(buildSchemaLoadFailureNotice(input.schemaErrorMessage));
  return true;
}

export function runNotifySchemaOptionsFailure(input: {
  driver: string;
  schemaOptionsError: unknown;
  showNotification: (notification: WorkbenchSchemaNotice) => void;
}): boolean {
  if (!input.schemaOptionsError || input.driver !== "postgres") return false;
  input.showNotification(buildSchemaOptionsFailureNotice(input.schemaOptionsError));
  return true;
}

export function runApplyDdlSettingsToSqlCopilotDraft(input: {
  ddlSettings: DdlSettings | undefined;
  setSqlCopilotSettingsDraft: (draft: SqlCopilotSettingsDraft) => void;
}): boolean {
  if (!input.ddlSettings) return false;
  input.setSqlCopilotSettingsDraft(pickSqlCopilotSettings(input.ddlSettings));
  return true;
}

export function runNotifyDdlSettingsFailure(input: {
  ddlSettingsError: unknown;
  showNotification: (notification: {
    title: string;
    description: string;
    variant: "destructive";
  }) => void;
}): boolean {
  if (!input.ddlSettingsError) return false;
  input.showNotification({
    title: "SQL copilot settings unavailable",
    description: formatWorkbenchError(
      input.ddlSettingsError,
      "Unable to load SQL copilot runtime settings.",
    ),
    variant: "destructive",
  });
  return true;
}

export function runResolveSelectedTableForSchema(input: {
  tables: Array<{ name: string }> | undefined;
  setSelectedTableName: (
    updater: (currentTableName: string | null) => string | null,
  ) => void;
}): void {
  input.setSelectedTableName((current) =>
    resolveSelectedTableName(current, input.tables),
  );
}
