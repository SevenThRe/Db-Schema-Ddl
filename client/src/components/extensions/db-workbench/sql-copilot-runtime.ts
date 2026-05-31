import type { DbSqlCopilotProbeResponse } from "@shared/schema";
import type { SqlCopilotGeneratedDraft } from "./sql-copilot-generation";
import { formatWorkbenchError } from "./workbench-errors";

export type SqlCopilotNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export type SqlCopilotRuntimeAction = "probe" | "generate";

export function getSqlCopilotRuntimeGateNotice(input: {
  settingsDirty: boolean;
  runtimeEnabled: boolean;
  action: SqlCopilotRuntimeAction;
}): SqlCopilotNotice | null {
  if (input.settingsDirty) {
    return {
      title: "Save runtime settings first",
      description:
        input.action === "generate"
          ? "Persist local provider changes before generating SQL so backend runtime state and prompt grounding stay aligned."
          : "Persist local provider changes before probing so backend runtime state and prompt grounding stay aligned.",
      variant: "default",
    };
  }

  if (!input.runtimeEnabled) {
    return {
      title: "SQL copilot runtime is disabled",
      description:
        input.action === "generate"
          ? "Enable the local runtime before generating SQL drafts."
          : "Enable the local runtime before warming it up or probing it.",
      variant: "default",
    };
  }

  return null;
}

export function buildSqlCopilotSettingsSavedNotice(): SqlCopilotNotice {
  return {
    title: "SQL copilot settings saved",
    description: "Local runtime configuration was updated for this workstation.",
    variant: "success",
  };
}

export function buildSqlCopilotSettingsFailureNotice(error: unknown): SqlCopilotNotice {
  return {
    title: "Failed to save SQL copilot settings",
    description: formatWorkbenchError(
      error,
      "Unable to persist SQL copilot runtime settings.",
    ),
    variant: "destructive",
  };
}

export function buildSqlCopilotProbeSuccessNotice(input: {
  response: DbSqlCopilotProbeResponse;
  warmupOnly: boolean;
}): SqlCopilotNotice {
  return {
    title: input.warmupOnly ? "SQL copilot warmed up" : "Grounded probe completed",
    description: `${input.response.provider} responded locally in ${input.response.latencyMs} ms.`,
    variant: "success",
  };
}

export function buildSqlCopilotProbeFailure(error: unknown): {
  message: string;
  notice: SqlCopilotNotice;
} {
  const message = formatWorkbenchError(error, "Local SQL copilot probe failed.");
  return {
    message,
    notice: {
      title: "SQL copilot probe failed",
      description: message,
      variant: "destructive",
    },
  };
}

export function buildEmptyGeneratedSqlDraftNotice(
  draft: Pick<SqlCopilotGeneratedDraft, "assumptions" | "safetyNotes">,
): {
  message: string;
  notice: SqlCopilotNotice;
} {
  const message =
    draft.assumptions[0] ??
    draft.safetyNotes[0] ??
    "The local model did not return a usable SQL draft.";

  return {
    message,
    notice: {
      title: "Generated draft needs review",
      description: message,
      variant: "default",
    },
  };
}

export function buildGeneratedSqlDraftSuccessNotice(input: {
  response: DbSqlCopilotProbeResponse;
  draft: Pick<SqlCopilotGeneratedDraft, "hallucinationRisk" | "safetyRegression">;
}): SqlCopilotNotice {
  const descriptionParts = [
    `${input.response.provider} responded locally in ${input.response.latencyMs} ms.`,
    input.draft.hallucinationRisk
      ? "Semantic diagnostics flagged possible grounding issues."
      : null,
    input.draft.safetyRegression
      ? "The draft includes risky write patterns and will stay behind safety gates."
      : null,
  ].filter(Boolean);

  return {
    title: "Generated SQL draft ready",
    description: descriptionParts.join(" "),
    variant:
      input.draft.hallucinationRisk || input.draft.safetyRegression
        ? "default"
        : "success",
  };
}

export function buildGeneratedSqlDraftFailure(error: unknown): {
  message: string;
  notice: SqlCopilotNotice;
} {
  const message = formatWorkbenchError(error, "Local SQL draft generation failed.");
  return {
    message,
    notice: {
      title: "SQL draft generation failed",
      description: message,
      variant: "destructive",
    },
  };
}
