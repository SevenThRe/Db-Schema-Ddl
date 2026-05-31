import type {
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "@shared/schema";
import { formatWorkbenchError } from "./workbench-errors";

export type SchemaDiffNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export type SchemaDiffWorkspaceState = {
  sourceSnapshot: DbSchemaSnapshot | null;
  targetSnapshot: DbSchemaSnapshot | null;
  result: DbSchemaDiffResult | null;
  issue: string | null;
};

export function createEmptySchemaDiffState(
  issue: string | null = null,
): SchemaDiffWorkspaceState {
  return {
    sourceSnapshot: null,
    targetSnapshot: null,
    result: null,
    issue,
  };
}

export function createSchemaDiffSuccessState(input: {
  sourceSnapshot: DbSchemaSnapshot;
  targetSnapshot: DbSchemaSnapshot;
  result: DbSchemaDiffResult;
}): SchemaDiffWorkspaceState {
  return {
    sourceSnapshot: input.sourceSnapshot,
    targetSnapshot: input.targetSnapshot,
    result: input.result,
    issue: null,
  };
}

export function createSchemaDiffFailureState(error: unknown): {
  state: SchemaDiffWorkspaceState;
  notice: SchemaDiffNotice;
} {
  const message = formatWorkbenchError(
    error,
    "Failed to compare schema between active and target connections.",
  );

  return {
    state: createEmptySchemaDiffState(message),
    notice: {
      title: "Schema compare failed",
      description: message,
      variant: "destructive",
    },
  };
}
